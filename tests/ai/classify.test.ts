import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import { openDatabase, type LocalDatabase } from '../../src/data/database';
import { ClassifyService, DRAFT_ID } from '../../src/ai/classify';
import type { AiService } from '../../src/ai/service';
import type { List, Repository } from '../../src/data/types';
import { AiPreferences } from '../../src/ai/preferences';
import { MemoryStorage } from '../helpers/storage';

const repository = (id: string, over: Partial<Repository> = {}): Repository => ({
  accountId: 'a1', id, fullName: 'owner/' + id, description: 'desc', language: 'TypeScript', topics: [],
  visibility: 'public', starredAt: '2024-01-01T00:00:00Z', pushedAt: null, archived: false,
  fetchedAt: '2024-01-01T00:00:00Z', ...over,
});
const category = (id: string, name: string): List => ({
  accountId: 'a1', id, name, description: null, isPrivate: false, syncedAt: '2024-01-01T00:00:00Z', source: 'manual', tracked: false,
});

let factory: IDBFactory;
let local: MemoryStorage;
let chat: ReturnType<typeof vi.fn>;
let service: ClassifyService;

async function withDb(run: (db: LocalDatabase) => Promise<void>): Promise<void> {
  const db = await openDatabase(factory);
  try { await run(db); } finally { db.close(); }
}

/** 按请求里的项目原样返回建议，模拟一个守规矩的服务。 */
function reply(messages: { role: string; content: string }[], name = '数据库'): string {
  const json = messages.find(message => message.role === 'user')!.content.split('\n')[1]!;
  const payload = JSON.parse(json) as { projects: { repositoryId: string }[] };
  return JSON.stringify({
    suggestions: payload.projects.map(project => ({
      repositoryId: project.repositoryId, categoryId: null, newCategoryName: name, reason: '用途接近', confidence: 0.9,
    })),
  });
}

beforeEach(async () => {
  factory = new IDBFactory();
  local = new MemoryStorage();
  chat = vi.fn(async (messages: { role: string; content: string }[]) => reply(messages));
  service = new ClassifyService(local, { chat } as unknown as AiService, () => openDatabase(factory), () => 1_700_000_000_000);
  await withDb(async db => {
    await db.put('accounts', 'a1', { accountId: 'a1', id: 'a1', login: 'demo', avatarUrl: '' });
    await db.put('lists', 'a1', category('local:tools', '工具'));
  });
});

describe('草稿建立与候选', () => {
  it('按整理配置建立草稿并给出队列', async () => {
    await withDb(async db => { for (const id of ['r1', 'r2', 'r3']) await db.put('repositories', 'a1', repository(id)); });
    const state = await service.start('a1');
    expect(state.draft?.state).toBe('running');
    expect(state.draft?.queue).toHaveLength(3);
    expect(state.draft?.processed).toBe(0);
    expect(state.unclassified).toBe(3);
    expect(state.config).toEqual({ includePrivate: false, timeoutSeconds: 120, batchSize: 30 });
  });

  it('拒绝不存在的账号与没有未分类项目的情况', async () => {
    await expect(service.start('missing')).rejects.toThrow('账号不存在');
    await expect(service.start('a1')).rejects.toThrow('没有未分类的项目');
  });

  it('默认跳过私有项目，配置开启后才纳入', async () => {
    await withDb(async db => {
      await db.put('repositories', 'a1', repository('open'));
      await db.put('repositories', 'a1', repository('secret', { visibility: 'private' }));
    });
    const hidden = await service.start('a1');
    expect(hidden.draft?.queue).toEqual(['open']);
    expect(hidden.draft?.skippedPrivate).toBe(1);
    await service.configSave({ includePrivate: true, timeoutSeconds: 120, batchSize: 30 });
    const shown = await service.start('a1');
    expect(shown.draft?.queue).toHaveLength(2);
    expect(await new AiPreferences(local).classifyConfig()).toEqual({ includePrivate: true, timeoutSeconds: 120, batchSize: 30 });
  });

  it('只有私有未分类项目时给出可执行的说明', async () => {
    await withDb(async db => { await db.put('repositories', 'a1', repository('secret', { visibility: 'private' })); });
    await expect(service.start('a1')).rejects.toThrow('都是私有仓库');
  });
});

describe('分批推进与直接写入', () => {
  it('每批成功后立即写入本地分类与归属', async () => {
    await withDb(async db => {
      await db.put('repositories', 'a1', repository('r1'));
      await db.put('repositories', 'a1', repository('r2'));
    });
    await service.start('a1');
    const state = await service.step('a1');
    expect(state.draft?.processed).toBe(2);
    expect(state.draft?.applied).toBe(2);
    expect(state.draft?.categoriesCreated).toBe(1);
    await withDb(async db => {
      expect((await db.list('lists', 'a1')).map(list => list.name)).toEqual(['数据库', '工具']);
      expect(await db.list('memberships', 'a1')).toHaveLength(2);
    });
  });

  it('按批量连续推进，队列清空后草稿被删除并给出结果', async () => {
    await withDb(async db => { for (let index = 0; index < 35; index++) await db.put('repositories', 'a1', repository('r' + String(index).padStart(2, '0'))); });
    await service.start('a1');
    const first = await service.step('a1');
    expect(first.draft?.processed).toBe(30);
    expect(first.draft?.applied).toBe(30);
    const second = await service.step('a1');
    expect(second.draft?.processed).toBe(35);
    const third = await service.step('a1');
    expect(third.draft).toBeNull();
    expect(third.result).toEqual({ applied: 35, categoriesCreated: 1 });
    expect(chat).toHaveBeenCalledTimes(2);
    await withDb(async db => {
      expect(await db.get('jobs', 'a1', DRAFT_ID)).toBeUndefined();
      expect(await db.list('memberships', 'a1')).toHaveLength(35);
    });
  });

  it('失败时不写入、丢弃草稿并抛出可读原因', async () => {
    await withDb(async db => {
      await db.put('repositories', 'a1', repository('r1'));
      await db.put('repositories', 'a1', repository('r2'));
    });
    await service.start('a1');
    chat.mockRejectedValueOnce(new Error('boom'));
    await expect(service.step('a1')).rejects.toThrow('整理中断：boom');
    await withDb(async db => {
      expect(await db.get('jobs', 'a1', DRAFT_ID)).toBeUndefined();
      expect(await db.list('lists', 'a1')).toHaveLength(1);
      expect(await db.list('memberships', 'a1')).toEqual([]);
    });
  });

  it('草稿留在本地，重建服务实例后可以继续', async () => {
    await withDb(async db => { for (let index = 0; index < 35; index++) await db.put('repositories', 'a1', repository('r' + String(index).padStart(2, '0'))); });
    await service.start('a1');
    await service.step('a1');
    const restarted = new ClassifyService(local, { chat } as unknown as AiService, () => openDatabase(factory), () => 1_700_000_000_000);
    const state = await restarted.step('a1');
    expect(state.draft?.processed).toBe(35);
    await withDb(async db => { expect(await db.get('jobs', 'a1', DRAFT_ID)).toBeTruthy(); });
  });

  it('中断后再次开始会重新计算队列，已写入的分类不重复处理', async () => {
    await withDb(async db => { for (const id of ['r1', 'r2']) await db.put('repositories', 'a1', repository(id)); });
    const first = await service.start('a1');
    expect(first.draft?.queue).toHaveLength(2);
    await service.step('a1');
    await service.step('a1');
    await withDb(async db => { expect(await db.get('jobs', 'a1', DRAFT_ID)).toBeUndefined(); });
    await expect(service.start('a1')).rejects.toThrow('没有未分类的项目');
  });
});

describe('提示词、配置与请求构造', () => {
  it('读取、保存与恢复默认提示词', async () => {
    const initial = await service.promptRead();
    expect(initial.prompt).toEqual(initial.defaults);
    const saved = await service.promptSave({ systemGuideline: '只按语言分类', userPrompt: '分类名用中文' });
    expect(saved.systemGuideline).toBe('只按语言分类');
    await expect(service.promptSave({ systemGuideline: 42, userPrompt: '' })).rejects.toThrow('分类准则');
  });

  it('整理配置决定超时时间与私有仓库范围', async () => {
    await withDb(async db => { await db.put('repositories', 'a1', repository('r1')); });
    expect(await service.configRead()).toEqual({ includePrivate: false, timeoutSeconds: 120, batchSize: 30 });
    await expect(service.configSave({ includePrivate: false, timeoutSeconds: 5, batchSize: 30 })).rejects.toThrow('15 到 600');
    await service.configSave({ includePrivate: false, timeoutSeconds: 200, batchSize: 30 });
    await service.start('a1');
    await service.step('a1');
    expect(chat.mock.calls[0]?.[1]).toBe(200_000);
  });

  it('每批整理数量决定单次请求包含的项目数', async () => {
    await withDb(async db => { for (const id of ['r1', 'r2', 'r3', 'r4', 'r5']) await db.put('repositories', 'a1', repository(id)); });
    await service.configSave({ includePrivate: false, timeoutSeconds: 120, batchSize: 2 });
    const state = await service.start('a1');
    expect(state.draft?.batchSize).toBe(2);
    expect(state.draft?.queue).toHaveLength(5);
    const first = await service.step('a1');
    expect(first.draft?.processed).toBe(2);
    expect((await service.step('a1')).draft?.processed).toBe(4);
    expect((await service.step('a1')).draft?.processed).toBe(5);
    const done = await service.step('a1');
    expect(done.draft).toBeNull();
    expect(done.result).toEqual({ applied: 5, categoriesCreated: 1 });
    expect(chat).toHaveBeenCalledTimes(3);
  });

  it('请求包含固定契约与附加要求，且不含私有项目', async () => {
    await withDb(async db => {
      await db.put('repositories', 'a1', repository('open'));
      await db.put('repositories', 'a1', repository('secret', { visibility: 'private' }));
    });
    await service.promptSave({ systemGuideline: '只按语言分类', userPrompt: '分类名用中文' });
    await service.start('a1');
    await service.step('a1');
    const messages = chat.mock.calls[0]![0] as { role: string; content: string }[];
    expect(messages[0]!.content).toContain('只输出 JSON');
    expect(messages[0]!.content).toContain('只按语言分类');
    expect(messages[1]!.content).toContain('## 附加要求');
    expect(messages[1]!.content).toContain('分类名用中文');
    expect(messages[1]!.content).toContain('"repositoryId":"open"');
    expect(messages[1]!.content).not.toContain('secret');
    expect(messages[1]!.content).toContain('"name":"工具"');
  });

  it('输出不合约定时抛出可读原因，不写入任何分类', async () => {
    await withDb(async db => { await db.put('repositories', 'a1', repository('r1')); });
    await service.start('a1');
    chat.mockResolvedValueOnce(JSON.stringify({ suggestions: [{ repositoryId: 'r1', categoryId: 'local:missing', newCategoryName: null, reason: 'x', confidence: 0.9 }] }));
    await expect(service.step('a1')).rejects.toThrow('本地不存在的分类 ID');
    await withDb(async db => { expect(await db.list('memberships', 'a1')).toEqual([]); });
  });

  it('新分类名与已有分类同名时归入已有分类', async () => {
    await withDb(async db => { await db.put('repositories', 'a1', repository('r1')); });
    await service.start('a1');
    chat.mockResolvedValueOnce(JSON.stringify({ suggestions: [{ repositoryId: 'r1', categoryId: null, newCategoryName: '工具', reason: 'x', confidence: 0.9 }] }));
    const state = await service.step('a1');
    expect(state.draft?.categoriesCreated).toBe(0);
    await withDb(async db => {
      expect(await db.list('lists', 'a1')).toHaveLength(1);
      expect((await db.list('memberships', 'a1'))[0]?.listId).toBe('local:tools');
    });
  });
});
