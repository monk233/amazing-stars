import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import type { Suggestion } from '../../src/ai/classification';
import { openDatabase, type LocalDatabase } from '../../src/data/database';
import type { List, Membership, Repository } from '../../src/data/types';
import { applySuggestions } from '../../src/library/apply-suggestions';

const repository = (id: string): Repository => ({
  accountId: 'a1', id, fullName: 'owner/' + id, description: null, language: null, topics: [],
  visibility: 'public', starredAt: '2024-01-01T00:00:00Z', pushedAt: null, archived: false,
  fetchedAt: '2024-01-01T00:00:00Z',
});
const category = (id: string, name: string, over: Partial<List> = {}): List => ({
  accountId: 'a1', id, name, description: null, isPrivate: false, syncedAt: '2024-01-01T00:00:00Z',
  source: 'manual', tracked: false, ...over,
});
const suggestion = (over: Partial<Suggestion> = {}): Suggestion => ({
  repositoryId: 'r1', categoryId: null, newCategoryName: '数据库', reason: '用途接近', confidence: 0.9, ...over,
});

let factory: IDBFactory;
let db: LocalDatabase;
beforeEach(async () => { factory = new IDBFactory(); db = await openDatabase(factory); });
afterEach(() => { db.close(); });

describe('确认后的分类写入', () => {
  it('为新分类建一次记录并写入归属', async () => {
    await db.put('repositories', 'a1', repository('r1'));
    const result = await applySuggestions(db, 'a1', [suggestion()], ['r1']);
    expect(result).toEqual({ applied: 1, categoriesCreated: 1, skipped: 0 });
    const lists = await db.list('lists', 'a1');
    expect(lists).toHaveLength(1);
    expect(lists[0]).toMatchObject({ name: '数据库', source: 'manual', tracked: false, description: null, isPrivate: false });
    expect(await db.list('memberships', 'a1')).toEqual([
      expect.objectContaining({ repositoryId: 'r1', listId: lists[0]!.id, source: 'manual' }),
    ]);
  });

  it('归入已有分类时不新建分类', async () => {
    await db.put('lists', 'a1', category('local:tools', '工具'));
    await db.put('repositories', 'a1', repository('r1'));
    const result = await applySuggestions(db, 'a1', [suggestion({ categoryId: 'local:tools', newCategoryName: null })], ['r1']);
    expect(result).toEqual({ applied: 1, categoriesCreated: 0, skipped: 0 });
    expect(await db.list('lists', 'a1')).toHaveLength(1);
  });

  it('往远端来源分类里加项目后，该分类脱离远端跟踪', async () => {
    await db.put('lists', 'a1', category('remote:1', 'AI 工具', { source: 'remote', tracked: true }));
    await db.put('repositories', 'a1', repository('r1'));
    await applySuggestions(db, 'a1', [suggestion({ categoryId: 'remote:1', newCategoryName: null })], ['r1']);
    expect((await db.get('lists', 'a1', 'remote:1'))?.tracked).toBe(false);
  });

  it('已经有归属的项目被跳过，且不产生空分类', async () => {
    await db.put('repositories', 'a1', repository('r1'));
    await db.put('lists', 'a1', category('local:keep', '手工分类'));
    await db.put('memberships', 'a1', { accountId: 'a1', id: 'local:keep:r1', repositoryId: 'r1', listId: 'local:keep', source: 'manual' } satisfies Membership);
    const result = await applySuggestions(db, 'a1', [suggestion()], ['r1']);
    expect(result).toEqual({ applied: 0, categoriesCreated: 0, skipped: 1 });
    expect((await db.list('lists', 'a1')).map(list => list.id)).toEqual(['local:keep']);
    expect(await db.list('memberships', 'a1')).toHaveLength(1);
  });

  it('同名的多个新分类合并成一个', async () => {
    await db.put('repositories', 'a1', repository('r1'));
    await db.put('repositories', 'a1', repository('r2'));
    const result = await applySuggestions(db, 'a1', [suggestion(), suggestion({ repositoryId: 'r2' })], ['r1', 'r2']);
    expect(result).toEqual({ applied: 2, categoriesCreated: 1, skipped: 0 });
    expect(await db.list('lists', 'a1')).toHaveLength(1);
    expect(await db.list('memberships', 'a1')).toHaveLength(2);
  });

  it('拒绝空选择与不在建议中的项目，且不写入任何内容', async () => {
    await db.put('repositories', 'a1', repository('r1'));
    await expect(applySuggestions(db, 'a1', [suggestion()], [])).rejects.toThrow('至少选择一个');
    await expect(applySuggestions(db, 'a1', [suggestion()], ['r1', 'other'])).rejects.toThrow('不在本次建议中');
    await expect(applySuggestions(db, 'a1', [suggestion({ repositoryId: 'r9' })], ['r9'])).rejects.toThrow('不在本地收藏中');
    await expect(applySuggestions(db, 'a1', [suggestion({ categoryId: 'local:gone', newCategoryName: null })], ['r1'])).rejects.toThrow('已不存在');
    expect(await db.list('lists', 'a1')).toEqual([]);
    expect(await db.list('memberships', 'a1')).toEqual([]);
  });

  it('只影响目标账号', async () => {
    await db.put('repositories', 'a1', repository('r1'));
    await db.put('repositories', 'a2', { ...repository('r1'), accountId: 'a2' });
    await db.put('lists', 'a2', { ...category('local:other', '另一个账号'), accountId: 'a2' });
    await applySuggestions(db, 'a1', [suggestion()], ['r1']);
    expect((await db.list('lists', 'a2')).map(list => list.id)).toEqual(['local:other']);
    expect(await db.list('memberships', 'a2')).toEqual([]);
  });
});
