import type { StorageArea } from '../data/storage';
import { DEFAULT_BATCH_SIZE, MAX_BATCH_SIZE, MIN_BATCH_SIZE, isBatchSize } from './classification';
import { AiError } from './config';

export const MAX_PROMPT_LENGTH = 8000;
export const PROMPT_KEY = 'ai:prompt:v1';
export const CLASSIFY_KEY = 'ai:classify:v2';
const LEGACY_CLASSIFY_KEY = 'ai:classify:v1';
export const MIN_TIMEOUT_SECONDS = 15;
export const MAX_TIMEOUT_SECONDS = 600;
export const DEFAULT_TIMEOUT_SECONDS = 120;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

export interface AiPrompt { version: 1; systemGuideline: string; userPrompt: string }
/** 整理相关的本地偏好：是否发送私有项目、单次请求超时、每批请求多少个项目。 */
export interface ClassifyConfig { includePrivate: boolean; timeoutSeconds: number; batchSize: number }
export const defaultClassifyConfig = (): ClassifyConfig =>
  ({ includePrivate: false, timeoutSeconds: DEFAULT_TIMEOUT_SECONDS, batchSize: DEFAULT_BATCH_SIZE });

/**
 * 固定契约是代码常量：界面只读展示，不落存储、不可编辑。
 * 校验层不依赖提示词，所以改写准则也无法让越界结果通过。
 */
export const FIXED_CONTRACT = [
  '你在为一位开发者整理本地开源收藏的分类。',
  '只输出 JSON：{"suggestions":[{"repositoryId":string,"categoryId":string|null,"newCategoryName":string|null,"reason":string,"confidence":number}]}。不要输出解释文字、代码块或额外字段。',
  'repositoryId 只能取输入 projects 中出现的值。',
  'categoryId 只能取输入 categories 中出现的 id，或为 null；为 null 时用 newCategoryName 给出 1 到 80 字的分类名，否则 newCategoryName 必须是 null。',
  'reason 用一句中文说明判定依据，不超过 200 字；confidence 是 0 到 1 之间的数字。',
  '不确定时降低 confidence 并在 reason 中说明，不要用猜测填满结果。',
  '不要取消 Star，不要删除或重命名已有分类，不要移除已有归属。',
  '不要索取或输出任何凭证，不要要求执行网络请求。',
].join('\n');

export const DEFAULT_SYSTEM_GUIDELINE = [
  '按项目的主要用途分类，语言与框架只作为辅助信号。',
  '优先使用已有分类：语义接近就归入已有分类，不要为它新建名字相近的分类。',
  '同一类项目归入同一个分类，保持分类粒度大致均衡，避免只放一个项目的分类。',
  '理由写清判定依据；信息不足时降低 confidence。',
].join('\n');

export const DEFAULT_USER_PROMPT = '';

export const defaultPrompt = (): AiPrompt => ({ version: 1, systemGuideline: DEFAULT_SYSTEM_GUIDELINE, userPrompt: DEFAULT_USER_PROMPT });

export const isTimeout = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= MIN_TIMEOUT_SECONDS && value <= MAX_TIMEOUT_SECONDS;

function timeoutSeconds(raw: unknown): number {
  if (!isTimeout(raw)) {
    throw new AiError(`请求超时需要是 ${MIN_TIMEOUT_SECONDS} 到 ${MAX_TIMEOUT_SECONDS} 之间的整数秒。`);
  }
  return raw;
}

function batchSizeValue(raw: unknown): number {
  if (!isBatchSize(raw)) {
    throw new AiError(`每批整理数量需要是 ${MIN_BATCH_SIZE} 到 ${MAX_BATCH_SIZE} 之间的整数。`);
  }
  return raw;
}

/** 消息层与存储层共用同一条长度与控制字符约定。 */
export const isPromptText = (value: unknown): value is string =>
  typeof value === 'string' && value.length <= MAX_PROMPT_LENGTH && !CONTROL.test(value);

function promptText(raw: unknown, label: string): string {
  if (!isPromptText(raw)) throw new AiError(`${label}不能超过 ${MAX_PROMPT_LENGTH} 个字符，且不能包含控制字符。`);
  return raw;
}

/** 提示词与分类偏好的本地存储。默认值来自代码常量，不随扩展更新被覆盖。 */
export class PromptStore {
  constructor(private readonly storage: StorageArea) {}

  async read(): Promise<AiPrompt> {
    const raw = (await this.storage.get(PROMPT_KEY))[PROMPT_KEY];
    if (raw === undefined) return defaultPrompt();
    if (!raw || typeof raw !== 'object') throw new AiError('AI 提示词存储损坏，未覆盖原数据。');
    const value = raw as Record<string, unknown>;
    if (value.version !== 1) throw new AiError('AI 提示词版本不受支持，未覆盖原数据。');
    try {
      return {
        version: 1,
        systemGuideline: promptText(value.systemGuideline, '分类准则'),
        userPrompt: promptText(value.userPrompt, '用户提示词'),
      };
    } catch (error: unknown) {
      throw new AiError(`${error instanceof AiError ? error.message : 'AI 提示词内容无效。'}未覆盖原数据。`);
    }
  }

  async save(input: { systemGuideline: unknown; userPrompt: unknown }): Promise<AiPrompt> {
    const prompt: AiPrompt = {
      version: 1,
      systemGuideline: promptText(input.systemGuideline, '分类准则'),
      userPrompt: promptText(input.userPrompt, '用户提示词'),
    };
    await this.read();
    await this.storage.set({ [PROMPT_KEY]: prompt });
    return prompt;
  }

  /** 恢复默认是显式重置，允许修复损坏的旧值。 */
  async reset(): Promise<AiPrompt> {
    const prompt = defaultPrompt();
    await this.storage.set({ [PROMPT_KEY]: prompt });
    return prompt;
  }

  async classifyConfig(): Promise<ClassifyConfig> {
    const raw = (await this.storage.get(CLASSIFY_KEY))[CLASSIFY_KEY];
    if (raw === undefined) {
      // 早期版本只保存了私有仓库开关，其余沿用默认值。
      const legacy = (await this.storage.get(LEGACY_CLASSIFY_KEY))[LEGACY_CLASSIFY_KEY];
      if (legacy && typeof legacy === 'object' && (legacy as Record<string, unknown>).version === 1) {
        return { ...defaultClassifyConfig(), includePrivate: (legacy as Record<string, unknown>).includePrivate === true };
      }
      return defaultClassifyConfig();
    }
    if (!raw || typeof raw !== 'object') throw new AiError('分类偏好存储损坏，未覆盖原数据。');
    const value = raw as Record<string, unknown>;
    if (value.version !== 2 || typeof value.includePrivate !== 'boolean' || !isTimeout(value.timeoutSeconds)) {
      throw new AiError('分类偏好版本或内容无效，未覆盖原数据。');
    }
    // 更早的 v2 记录没有 batchSize 字段，缺失时用默认值。
    return { includePrivate: value.includePrivate, timeoutSeconds: value.timeoutSeconds, batchSize: isBatchSize(value.batchSize) ? value.batchSize : DEFAULT_BATCH_SIZE };
  }

  async setClassifyConfig(input: { includePrivate: unknown; timeoutSeconds: unknown; batchSize: unknown }): Promise<ClassifyConfig> {
    if (typeof input.includePrivate !== 'boolean') throw new AiError('私有仓库开关取值无效。');
    const config: ClassifyConfig = {
      includePrivate: input.includePrivate,
      timeoutSeconds: timeoutSeconds(input.timeoutSeconds),
      batchSize: batchSizeValue(input.batchSize),
    };
    await this.storage.set({ [CLASSIFY_KEY]: { version: 2, ...config } });
    return config;
  }
}
