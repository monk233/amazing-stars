import { describe, expect, it } from 'vitest';
import { CLASSIFY_KEY, DEFAULT_SYSTEM_GUIDELINE, MAX_PROMPT_LENGTH, PROMPT_KEY, PromptStore, defaultPrompt } from '../../src/ai/prompt';
import { MemoryStorage } from '../helpers/storage';

describe('AI 提示词与分类偏好', () => {
  it('无存储时返回代码内默认值', async () => {
    const store = new PromptStore(new MemoryStorage());
    expect(await store.read()).toEqual(defaultPrompt());
    expect(DEFAULT_SYSTEM_GUIDELINE.length).toBeGreaterThan(0);
    expect(await store.classifyConfig()).toEqual({ includePrivate: false, timeoutSeconds: 120, batchSize: 30 });
  });

  it('保存后原样读回，并拒绝超长与控制字符', async () => {
    const storage = new MemoryStorage();
    const store = new PromptStore(storage);
    await store.save({ systemGuideline: '只按语言分类', userPrompt: '多用中文分类名' });
    expect(await store.read()).toEqual({ version: 1, systemGuideline: '只按语言分类', userPrompt: '多用中文分类名' });
    await expect(store.save({ systemGuideline: 'a'.repeat(MAX_PROMPT_LENGTH + 1), userPrompt: '' })).rejects.toThrow('8000');
    await expect(store.save({ systemGuideline: 'ok', userPrompt: 'bad\u0007text' })).rejects.toThrow('控制字符');
    expect((await store.read()).systemGuideline).toBe('只按语言分类');
  });

  it('损坏数据不覆盖，恢复默认可以修复', async () => {
    const storage = new MemoryStorage();
    storage.items[PROMPT_KEY] = { version: 1, systemGuideline: 42, userPrompt: '' };
    const store = new PromptStore(storage);
    await expect(store.read()).rejects.toThrow('未覆盖原数据');
    await expect(store.save({ systemGuideline: 'new', userPrompt: '' })).rejects.toThrow('未覆盖原数据');
    expect(storage.items[PROMPT_KEY]).toEqual({ version: 1, systemGuideline: 42, userPrompt: '' });
    expect(await store.reset()).toEqual(defaultPrompt());
    expect(storage.items[PROMPT_KEY]).toEqual(defaultPrompt());
  });

  it('版本不受支持时拒绝读取', async () => {
    const storage = new MemoryStorage();
    storage.items[PROMPT_KEY] = { version: 2, systemGuideline: '', userPrompt: '' };
    await expect(new PromptStore(storage).read()).rejects.toThrow('版本不受支持');
  });

  it('整理配置默认值、保存与取值校验', async () => {
    const storage = new MemoryStorage();
    const store = new PromptStore(storage);
    expect(await store.classifyConfig()).toEqual({ includePrivate: false, timeoutSeconds: 120, batchSize: 30 });
    expect(await store.setClassifyConfig({ includePrivate: true, timeoutSeconds: 300, batchSize: 50 }))
      .toEqual({ includePrivate: true, timeoutSeconds: 300, batchSize: 50 });
    expect(storage.items[CLASSIFY_KEY]).toEqual({ version: 2, includePrivate: true, timeoutSeconds: 300, batchSize: 50 });
    expect(await store.classifyConfig()).toEqual({ includePrivate: true, timeoutSeconds: 300, batchSize: 50 });
    await expect(store.setClassifyConfig({ includePrivate: true, timeoutSeconds: 5, batchSize: 30 })).rejects.toThrow('15 到 600');
    await expect(store.setClassifyConfig({ includePrivate: true, timeoutSeconds: 601, batchSize: 30 })).rejects.toThrow('15 到 600');
    await expect(store.setClassifyConfig({ includePrivate: true, timeoutSeconds: 120, batchSize: 0 })).rejects.toThrow('1 到 100');
    await expect(store.setClassifyConfig({ includePrivate: true, timeoutSeconds: 120, batchSize: 101 })).rejects.toThrow('1 到 100');
    await expect(store.setClassifyConfig({ includePrivate: 'yes', timeoutSeconds: 120, batchSize: 30 })).rejects.toThrow('取值无效');
    storage.items[CLASSIFY_KEY] = { version: 9 };
    await expect(store.classifyConfig()).rejects.toThrow('无效');
  });

  it('读取旧版分类偏好时沿用默认值', async () => {
    const storage = new MemoryStorage();
    storage.items['ai:classify:v1'] = { version: 1, includePrivate: true };
    expect(await new PromptStore(storage).classifyConfig()).toEqual({ includePrivate: true, timeoutSeconds: 120, batchSize: 30 });
    // 更早的 v2 记录没有 batchSize 字段，缺失时同样用默认批量。
    storage.items[CLASSIFY_KEY] = { version: 2, includePrivate: false, timeoutSeconds: 90 };
    expect(await new PromptStore(storage).classifyConfig()).toEqual({ includePrivate: false, timeoutSeconds: 90, batchSize: 30 });
  });
});
