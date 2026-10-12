import { describe, expect, it } from 'vitest';
import { DEFAULT_BATCH_SIZE, nextBatch, normalizeSuggestions, parseSuggestions, unclassifiedQueue, type Suggestion } from '../../src/ai/classification';
import type { List, Membership, Repository } from '../../src/data/types';

const repo = (id: string, over: Partial<Repository> = {}): Repository => ({
  accountId: 'a1', id, fullName: 'owner/' + id, description: null, language: null, topics: [],
  visibility: 'public', starredAt: '2024-01-01T00:00:00Z', pushedAt: null, archived: false,
  fetchedAt: '2024-01-01T00:00:00Z', ...over,
});
const category = (id: string, name: string): List => ({
  accountId: 'a1', id, name, description: null, isPrivate: false, syncedAt: '2024-01-01T00:00:00Z', source: 'manual', tracked: false,
});
const link = (repositoryId: string, listId: string): Membership => ({ accountId: 'a1', id: listId + ':' + repositoryId, repositoryId, listId, source: 'manual' });
const suggestion = (over: Partial<Suggestion> = {}): Suggestion => ({
  repositoryId: 'r1', categoryId: null, newCategoryName: '工具', reason: '用途接近', confidence: 0.9, ...over,
});
const payload = (suggestions: unknown[]): string => JSON.stringify({ suggestions });

describe('未分类候选与批次切分', () => {
  it('排除已有归属的项目，按收藏时间倒序排列', () => {
    const repositories = [
      repo('old', { starredAt: '2023-01-01T00:00:00Z' }),
      repo('new', { starredAt: '2024-06-01T00:00:00Z' }),
      repo('listed'),
      repo('tie', { starredAt: '2024-06-01T00:00:00Z' }),
    ];
    const result = unclassifiedQueue(repositories, [link('listed', 'l1')], false);
    expect(result.queue.map(item => item.id)).toEqual(['new', 'tie', 'old']);
    expect(result.skippedPrivate).toBe(0);
  });

  it('默认跳过私有项目并报告数量，开启后才纳入', () => {
    const repositories = [repo('open'), repo('secret', { visibility: 'private' })];
    const hidden = unclassifiedQueue(repositories, [], false);
    expect(hidden.queue.map(item => item.id)).toEqual(['open']);
    expect(hidden.skippedPrivate).toBe(1);
    expect(unclassifiedQueue(repositories, [], true).queue.map(item => item.id)).toEqual(['open', 'secret']);
  });

  it('按固定批量切分队列', () => {
    const queue = Array.from({ length: DEFAULT_BATCH_SIZE + 5 }, (_, index) => 'r' + index);
    expect(nextBatch(queue, 0)).toHaveLength(DEFAULT_BATCH_SIZE);
    expect(nextBatch(queue, DEFAULT_BATCH_SIZE)).toEqual(['r30', 'r31', 'r32', 'r33', 'r34']);
    expect(nextBatch(queue, queue.length)).toEqual([]);
    expect(nextBatch(queue, 0, 2)).toEqual(['r0', 'r1']);
  });
});

describe('模型输出校验', () => {
  const batch = [repo('r1'), repo('r2')];
  const lists = [category('local:tools', '工具')];

  it('接受合法响应并保留字段', () => {
    const parsed = parseSuggestions(payload([suggestion()]), batch, lists);
    expect(parsed).toEqual([suggestion()]);
    expect(parseSuggestions(payload([suggestion({ categoryId: 'local:tools', newCategoryName: null })]), batch, lists)).toHaveLength(1);
  });

  it('拒绝非 JSON、非对象、缺少数组与超出批次的响应', () => {
    expect(() => parseSuggestions('不是 JSON', batch, lists)).toThrow('不是有效 JSON');
    expect(() => parseSuggestions('[]', batch, lists)).toThrow('不是对象结构');
    expect(() => parseSuggestions('{}', batch, lists)).toThrow('缺少 suggestions');
    expect(() => parseSuggestions(payload([suggestion(), suggestion({ repositoryId: 'r2' }), suggestion()]), batch, lists)).toThrow('超出本次请求范围');
  });

  it('拒绝不属于本批的项目与不存在的分类', () => {
    expect(() => parseSuggestions(payload([suggestion({ repositoryId: 'other' })]), batch, lists)).toThrow('本次请求之外的项目 ID');
    expect(() => parseSuggestions(payload([suggestion({ categoryId: 'local:missing', newCategoryName: null })]), batch, lists)).toThrow('本地不存在的分类 ID');
  });

  it('拒绝未约定字段、非法新分类名与分类名冲突', () => {
    expect(() => parseSuggestions(JSON.stringify({ suggestions: [{ ...suggestion(), extra: 1 }] }), batch, lists)).toThrow('未约定的字段');
    expect(() => parseSuggestions(payload([suggestion({ newCategoryName: '   ' })]), batch, lists)).toThrow('新分类名无效');
    expect(() => parseSuggestions(payload([suggestion({ newCategoryName: 'a'.repeat(81) })]), batch, lists)).toThrow('新分类名无效');
    expect(() => parseSuggestions(payload([suggestion({ categoryId: 'local:tools' })]), batch, lists)).toThrow('同时给出了新分类名');
    expect(() => parseSuggestions(payload([suggestion({ categoryId: 'local:tools', newCategoryName: '工具' })]), batch, lists)).toThrow('同时给出了新分类名');
  });

  it('拒绝无效理由与置信度', () => {
    expect(() => parseSuggestions(payload([suggestion({ reason: 'a'.repeat(201) })]), batch, lists)).toThrow('理由无效');
    expect(() => parseSuggestions(payload([suggestion({ reason: 'bad\u0007' })]), batch, lists)).toThrow('理由无效');
    expect(() => parseSuggestions(payload([suggestion({ confidence: 1.5 })]), batch, lists)).toThrow('置信度无效');
    expect(() => parseSuggestions(payload([suggestion({ confidence: Number.NaN })]), batch, lists)).toThrow('置信度无效');
    expect(() => parseSuggestions(payload([suggestion({ confidence: '0.9' as unknown as number })]), batch, lists)).toThrow('置信度无效');
  });
});

describe('建议归一化', () => {
  const lists = [category('local:tools', '工具'), category('local:web', '前端')];

  it('同一项目只保留第一条建议', () => {
    const result = normalizeSuggestions([suggestion({ confidence: 0.9 }), suggestion({ confidence: 0.4 })], lists);
    expect(result).toHaveLength(1);
    expect(result[0]?.confidence).toBe(0.9);
  });

  it('新分类名与已有分类同名时改为归入已有分类', () => {
    const result = normalizeSuggestions([suggestion({ newCategoryName: ' 工具 ' })], lists);
    expect(result[0]).toMatchObject({ categoryId: 'local:tools', newCategoryName: null });
  });

  it('真正的新分类保持原样', () => {
    const result = normalizeSuggestions([suggestion({ newCategoryName: '数据库' })], lists);
    expect(result[0]).toMatchObject({ categoryId: null, newCategoryName: '数据库' });
  });
});
