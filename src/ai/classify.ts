import { openDatabase, type LocalDatabase } from '../data/database';
import type { StorageArea } from '../data/storage';
import type { Job, List, Repository } from '../data/types';
import { applySuggestions } from '../library/apply-suggestions';
import { nextBatch, normalizeSuggestions, parseSuggestions, unclassifiedQueue } from './classification';
import { AiError } from './config';
import { DEFAULT_SYSTEM_GUIDELINE, FIXED_CONTRACT, PromptStore, defaultPrompt, type AiPrompt, type ClassifyConfig } from './prompt';
import type { AiService } from './service';

export const DRAFT_ID = 'classify:ai';

/**
 * 整理草稿只记录进度与累计结果：每批建议通过校验后立即写入本地分类，没有待确认的中间态。
 * 队列跑完或某一批失败时草稿被删除，所以它只在运行期间存在。存 jobs 表，与同步任务同层但不共享记录。
 */
export interface ClassificationDraft extends Job {
  mode: 'ai-classify';
  queue: string[];
  processed: number;
  batchSize: number;
  includePrivate: boolean;
  skippedPrivate: number;
  applied: number;
  categoriesCreated: number;
}

export interface ClassifyState {
  draft: ClassificationDraft | null;
  unclassified: number;
  config: ClassifyConfig;
  /** 刚结束的一轮结果，用于界面给出摘要；普通读取时为 null。 */
  result: { applied: number; categoriesCreated: number } | null;
}

/**
 * AI 分类编排：分批请求模型，每批成功后直接写入本地分类。
 * 驱动方式是管理页逐批调用 step，与 Git 同步一致：页面关闭即暂停，草稿留在本地。
 */
export class ClassifyService {
  constructor(
    private readonly local: StorageArea,
    private readonly ai: AiService,
    private readonly database: () => Promise<LocalDatabase> = openDatabase,
    private readonly now: () => number = Date.now,
  ) {}

  private prompts(): PromptStore { return new PromptStore(this.local); }

  async promptRead(): Promise<{ prompt: AiPrompt; defaults: AiPrompt }> {
    return { prompt: await this.prompts().read(), defaults: defaultPrompt() };
  }

  promptSave(input: { systemGuideline: unknown; userPrompt: unknown }): Promise<AiPrompt> {
    return this.prompts().save(input);
  }

  configRead(): Promise<ClassifyConfig> { return this.prompts().classifyConfig(); }

  configSave(input: { includePrivate: unknown; timeoutSeconds: unknown; batchSize: unknown }): Promise<ClassifyConfig> {
    return this.prompts().setClassifyConfig(input);
  }

  async read(accountId: string): Promise<ClassifyState> {
    const db = await this.database();
    try { return await this.snapshot(db, accountId); } finally { db.close(); }
  }

  async start(accountId: string): Promise<ClassifyState> {
    const db = await this.database();
    try {
      if (!await db.get('accounts', accountId, accountId)) throw new AiError('账号不存在，请先连接 Git 账号。');
      const config = await this.prompts().classifyConfig();
      const [repositories, memberships] = await Promise.all([db.list('repositories', accountId), db.list('memberships', accountId)]);
      const { queue, skippedPrivate } = unclassifiedQueue(repositories, memberships, config.includePrivate);
      if (!queue.length) {
        throw new AiError(skippedPrivate
          ? `没有可整理的项目：${skippedPrivate} 个未分类项目都是私有仓库；需要时可在「AI 服务 → 整理配置」里允许发送私有项目。`
          : '没有未分类的项目，无需整理。');
      }
      const draft: ClassificationDraft = {
        accountId, id: DRAFT_ID, type: 'classify', targetId: 'unclassified', state: 'running',
        deduplicationKey: `classify:${accountId}`, revision: this.now(), attempts: 0, nextRunAt: 0, leaseUntil: null,
        mode: 'ai-classify', queue: queue.map(repo => repo.id), processed: 0, batchSize: config.batchSize,
        includePrivate: config.includePrivate, skippedPrivate, applied: 0, categoriesCreated: 0,
      };
      await this.putDraft(db, draft);
      return await this.snapshot(db, accountId);
    } finally { db.close(); }
  }

  async step(accountId: string): Promise<ClassifyState> {
    const db = await this.database();
    try {
      const draft = await this.draft(db, accountId);
      if (!draft || draft.state !== 'running') return await this.snapshot(db, accountId);
      const ids = nextBatch(draft.queue, draft.processed, draft.batchSize);
      if (!ids.length) {
        // 队列清空即本轮结束，草稿不再需要。
        await db.remove('jobs', accountId, DRAFT_ID);
        return await this.snapshot(db, accountId, { applied: draft.applied, categoriesCreated: draft.categoriesCreated });
      }
      const repositories = await db.list('repositories', accountId);
      const byId = new Map(repositories.map(repo => [repo.id, repo]));
      const batch = ids.map(id => byId.get(id)).filter((repo): repo is Repository => !!repo);
      if (!batch.length) {
        // 项目在运行期间被移除：跳过这一批，不让草稿卡住。
        await this.putDraft(db, { ...draft, processed: draft.processed + ids.length });
        return await this.snapshot(db, accountId);
      }
      const lists = await db.list('lists', accountId);
      const config = await this.prompts().classifyConfig();
      try {
        const content = await this.ai.chat(await this.messages(batch, lists), config.timeoutSeconds * 1000);
        const parsed = normalizeSuggestions(parseSuggestions(content, batch, lists), lists);
        // 没有预览环节：这一批通过校验后立即写入，失败不会影响已经写入的批次。
        const result = await applySuggestions(db, accountId, parsed, parsed.map(item => item.repositoryId));
        await this.putDraft(db, {
          ...draft,
          processed: draft.processed + ids.length,
          applied: draft.applied + result.applied,
          categoriesCreated: draft.categoriesCreated + result.categoriesCreated,
        });
      } catch (error: unknown) {
        // 没有中断与重试入口：失败即结束本轮，草稿丢弃，已经写入的分类保留。
        await db.remove('jobs', accountId, DRAFT_ID).catch(() => undefined);
        const detail = error instanceof Error ? error.message : '本批请求失败。';
        throw new AiError(`整理中断：${detail} 已经处理的 ${draft.applied} 个项目保留在本地。`);
      }
      return await this.snapshot(db, accountId);
    } finally { db.close(); }
  }

  private async draft(db: LocalDatabase, accountId: string): Promise<ClassificationDraft | null> {
    return await db.get('jobs', accountId, DRAFT_ID) as ClassificationDraft | undefined ?? null;
  }

  /** jobs 表声明为 Job；草稿是它的超集，经参数传递可避开对象字面量的多余属性检查。 */
  private async putDraft(db: LocalDatabase, draft: ClassificationDraft): Promise<void> {
    await db.put('jobs', draft.accountId, draft);
  }

  private async snapshot(db: LocalDatabase, accountId: string, result: ClassifyState['result'] = null): Promise<ClassifyState> {
    const [draft, repositories, memberships, config] = await Promise.all([
      this.draft(db, accountId),
      db.list('repositories', accountId),
      db.list('memberships', accountId),
      this.prompts().classifyConfig(),
    ]);
    return {
      draft,
      // 候选总数包含被跳过的私有项目，界面需要如实说明跳过了多少。
      unclassified: unclassifiedQueue(repositories, memberships, true).queue.length,
      config,
      result,
    };
  }

  private async messages(batch: Repository[], lists: List[]): Promise<{ role: 'system' | 'user'; content: string }[]> {
    const prompt = await this.prompts().read();
    const guideline = prompt.systemGuideline.trim() || DEFAULT_SYSTEM_GUIDELINE;
    const projects = batch.map(repo => ({
      repositoryId: repo.id, fullName: repo.fullName, description: repo.description,
      language: repo.language, topics: repo.topics,
    }));
    const categories = lists.map(list => ({ id: list.id, name: list.name }));
    const task = [
      '## 待整理项目与已有分类',
      JSON.stringify({ projects, categories }),
      '',
      '为每个项目给出一条建议：优先归入已有分类，确实没有合适的再新建分类。',
    ];
    if (prompt.userPrompt.trim()) task.push('', '## 附加要求', prompt.userPrompt);
    return [
      { role: 'system', content: [FIXED_CONTRACT, '', '## 分类准则', guideline].join('\n') },
      { role: 'user', content: task.join('\n') },
    ];
  }
}
