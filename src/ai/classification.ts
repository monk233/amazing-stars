import type { List, Membership, Repository } from '../data/types';
import { categoryName } from '../library/categories';
import { AiError } from './config';

export const DEFAULT_BATCH_SIZE = 30;
export const MIN_BATCH_SIZE = 1;
export const MAX_BATCH_SIZE = 100;
export const CONFIDENCE_THRESHOLD = 0.8;
const MAX_REASON = 200;
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u;

export const isBatchSize = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= MIN_BATCH_SIZE && value <= MAX_BATCH_SIZE;

/** 一条分类建议：categoryId 为 null 表示建议新建分类，此时 newCategoryName 必填。 */
export interface Suggestion {
  repositoryId: string;
  categoryId: string | null;
  newCategoryName: string | null;
  reason: string;
  confidence: number;
}

/**
 * 未分类候选：没有任何归属的收藏，按收藏时间倒序、缺失时按 ID 升序排列。
 * 私有项目默认不进入候选，但计数要报给界面，不能静默消失。
 */
export function unclassifiedQueue(
  repositories: Repository[], memberships: Membership[], includePrivate: boolean,
): { queue: Repository[]; skippedPrivate: number } {
  const listed = new Set(memberships.map(link => link.repositoryId));
  const candidates = repositories.filter(repo => !listed.has(repo.id));
  const queue = candidates.filter(repo => includePrivate || repo.visibility !== 'private')
    .sort((a, b) => (Date.parse(b.starredAt) || 0) - (Date.parse(a.starredAt) || 0) || a.id.localeCompare(b.id));
  return { queue, skippedPrivate: candidates.length - queue.length };
}

export function nextBatch(queue: string[], processed: number, size = DEFAULT_BATCH_SIZE): string[] {
  return queue.slice(processed, processed + size);
}

/** 解析并严格校验模型输出。任何一条不合约定都拒绝整批，不写入草稿。 */
export function parseSuggestions(content: string, batch: Repository[], lists: List[]): Suggestion[] {
  let data: unknown;
  try { data = JSON.parse(content); } catch { throw new AiError('服务返回的内容不是有效 JSON，请确认该模型支持 JSON 输出。'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new AiError('服务返回的 JSON 不是对象结构。');
  const raw = (data as Record<string, unknown>).suggestions;
  if (!Array.isArray(raw)) throw new AiError('服务返回的 JSON 缺少 suggestions 数组。');
  if (raw.length > batch.length) throw new AiError('服务返回的建议数量超出本次请求范围。');
  const projects = new Set(batch.map(repo => repo.id));
  const categories = new Set(lists.map(list => list.id));
  const fields = 'categoryId,confidence,newCategoryName,reason,repositoryId';
  return raw.map((entry: unknown): Suggestion => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new AiError('服务返回的建议不是对象。');
    const item = entry as Record<string, unknown>;
    if (Object.keys(item).sort().join(',') !== fields) throw new AiError('服务返回的建议包含未约定的字段。');
    if (typeof item.repositoryId !== 'string' || !projects.has(item.repositoryId)) throw new AiError('服务返回了本次请求之外的项目 ID。');
    if (item.categoryId !== null && (typeof item.categoryId !== 'string' || !categories.has(item.categoryId))) {
      throw new AiError('服务返回了本地不存在的分类 ID。');
    }
    let newCategoryName: string | null = null;
    if (item.categoryId === null) {
      try { newCategoryName = categoryName(item.newCategoryName); }
      catch { throw new AiError('服务返回的新分类名无效，需要 1 到 80 个字符且不含控制字符。'); }
    } else if (item.newCategoryName !== null) {
      throw new AiError('服务在归入已有分类时同时给出了新分类名。');
    }
    if (typeof item.reason !== 'string' || item.reason.length > MAX_REASON || CONTROL.test(item.reason)) {
      throw new AiError('服务返回的理由无效。');
    }
    if (typeof item.confidence !== 'number' || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1) {
      throw new AiError('服务返回的置信度无效，需要 0 到 1 之间的数字。');
    }
    return {
      repositoryId: item.repositoryId,
      categoryId: item.categoryId as string | null,
      newCategoryName,
      reason: item.reason,
      confidence: item.confidence,
    };
  });
}

/** 同一项目只保留第一条建议；新分类名与已有分类同名时改为归入该分类。 */
export function normalizeSuggestions(suggestions: Suggestion[], lists: List[]): Suggestion[] {
  const byName = new Map(lists.map(list => [list.name.trim(), list.id]));
  const seen = new Set<string>();
  const result: Suggestion[] = [];
  for (const suggestion of suggestions) {
    if (seen.has(suggestion.repositoryId)) continue;
    seen.add(suggestion.repositoryId);
    const existing = suggestion.newCategoryName === null ? undefined : byName.get(suggestion.newCategoryName.trim());
    result.push(existing ? { ...suggestion, categoryId: existing, newCategoryName: null } : suggestion);
  }
  return result;
}
