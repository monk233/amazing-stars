import type { Suggestion } from '../ai/classification';
import type { LocalDatabase } from '../data/database';
import type { List, Membership } from '../data/types';
import { listSource, listTracked } from '../data/types';
import { newCategoryId } from './categories';

export interface ApplyResult { applied: number; categoriesCreated: number; skipped: number }

/**
 * 用户确认后的写入：新建分类、写入归属，一次事务提交。
 * 已被手动归类的项目直接跳过，不覆盖用户自己的调整；同名的多个新分类合并为一个。
 */
export async function applySuggestions(
  db: LocalDatabase, accountId: string, suggestions: Suggestion[], accepted: string[], now = new Date(),
): Promise<ApplyResult> {
  const chosen = [...new Set(accepted)];
  if (!chosen.length) throw new Error('请至少选择一个要写入的项目。');
  const byRepository = new Map(suggestions.map(item => [item.repositoryId, item]));
  const known = new Set((await db.list('repositories', accountId)).map(repo => repo.id));
  const lists = await db.list('lists', accountId);
  const existing = new Map(lists.map(list => [list.id, list]));
  const linked = new Set((await db.list('memberships', accountId)).map(link => link.repositoryId));

  const created = new Map<string, List>();
  const targets = new Map<string, string>();
  for (const repositoryId of chosen) {
    const suggestion = byRepository.get(repositoryId);
    if (!suggestion) throw new Error('选择里包含不在本次建议中的项目，已拒绝写入。');
    if (!known.has(repositoryId)) throw new Error('选择里包含不在本地收藏中的项目，已拒绝写入。');
    if (suggestion.categoryId) {
      if (!existing.has(suggestion.categoryId)) throw new Error('建议指向的分类已不存在，请重新整理。');
      targets.set(repositoryId, suggestion.categoryId);
      continue;
    }
    const name = suggestion.newCategoryName;
    if (!name) throw new Error('建议缺少分类信息，已拒绝写入。');
    const list = created.get(name) ?? {
      accountId, id: newCategoryId(), name, description: null, isPrivate: false,
      syncedAt: now.toISOString(), source: 'manual', tracked: false,
    };
    created.set(name, list);
    targets.set(repositoryId, list.id);
  }

  const puts: Membership[] = [];
  const touched = new Map<string, List>();
  let skipped = 0;
  for (const [repositoryId, categoryId] of targets) {
    if (linked.has(repositoryId)) { skipped += 1; continue; }
    puts.push({ accountId, id: categoryId + ':' + repositoryId, repositoryId, listId: categoryId, source: 'manual' });
    const list = existing.get(categoryId);
    // 本地往远端来源的分类里加项目，等于改动过它：与移动归属一致，脱离远端跟踪。
    if (list && listSource(list) === 'remote' && listTracked(list)) touched.set(list.id, { ...list, tracked: false });
  }
  const used = new Set(puts.map(link => link.listId));
  const fresh = [...created.values()].filter(list => used.has(list.id));
  if (!puts.length) return { applied: 0, categoriesCreated: 0, skipped };

  await db.commitLibrary(accountId, {
    lists: { put: [...fresh, ...touched.values()], remove: [] },
    memberships: { put: puts, remove: [] },
  });
  return { applied: puts.length, categoriesCreated: fresh.length, skipped };
}
