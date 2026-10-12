import { useCallback, useEffect, useRef, useState } from 'react';
import type { ClassifyState } from '../ai/classify';
import type { AiPrompt, ClassifyConfig } from '../ai/preferences';
import { request } from './client';

const reason = (error: unknown, fallback: string) => error instanceof Error ? error.message : fallback;

export interface ClassifyRunResult {
  ok: boolean;
  applied: number;
  categoriesCreated: number;
  message: string;
}

/**
 * 分类整理的控制器：读取提示词与整理配置，分批请求模型，每批直接写入本地分类。
 * 一次运行跑到底，没有中断入口；失败由服务端结束本轮，这里只把结果交回给界面。
 */
export function useClassify() {
  const [state, setState] = useState<ClassifyState | null>(null);
  const [prompt, setPrompt] = useState<AiPrompt | null>(null);
  const [defaults, setDefaults] = useState<AiPrompt | null>(null);
  const [config, setConfig] = useState<ClassifyConfig | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ processed: 0, total: 0 });
  const mounted = useRef(false);
  const active = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const read = useCallback(async (accountId: string) => {
    try {
      const reply = await request({ type: 'AI_CLASSIFY_READ', accountId });
      if (!reply.ok || !('draft' in reply.value)) throw new Error('分类状态响应无效。');
      if (mounted.current) setState(reply.value);
    } catch (error: unknown) {
      if (mounted.current) setError(reason(error, '无法读取整理状态，请重新打开管理页。'));
    }
  }, []);

  const readPrompt = useCallback(async () => {
    try {
      const reply = await request({ type: 'AI_PROMPT_READ' });
      if (!reply.ok || !('prompt' in reply.value)) throw new Error('提示词响应无效。');
      if (mounted.current) { setPrompt(reply.value.prompt); setDefaults(reply.value.defaults); }
    } catch (error: unknown) {
      if (mounted.current) setError(reason(error, '无法读取提示词。'));
    }
  }, []);

  const savePrompt = useCallback(async (systemGuideline: string, userPrompt: string): Promise<boolean> => {
    setSaving(true); setError(''); setNotice('');
    try {
      const reply = await request({ type: 'AI_PROMPT_SAVE', systemGuideline, userPrompt });
      if (!reply.ok || !('systemGuideline' in reply.value)) throw new Error('提示词响应无效。');
      if (mounted.current) { setPrompt(reply.value); setNotice('提示词已保存。'); }
      return true;
    } catch (error: unknown) {
      if (mounted.current) setError(reason(error, '保存提示词失败。'));
      return false;
    } finally { if (mounted.current) setSaving(false); }
  }, []);

  const readConfig = useCallback(async () => {
    try {
      const reply = await request({ type: 'AI_CLASSIFY_CONFIG_READ' });
      if (!reply.ok || !('timeoutSeconds' in reply.value)) throw new Error('整理配置响应无效。');
      if (mounted.current) setConfig(reply.value);
    } catch (error: unknown) {
      if (mounted.current) setError(reason(error, '无法读取整理配置。'));
    }
  }, []);

  const saveConfig = useCallback(async (includePrivate: boolean, timeoutSeconds: number, batchSize: number): Promise<boolean> => {
    setSaving(true); setError(''); setNotice('');
    try {
      const reply = await request({ type: 'AI_CLASSIFY_CONFIG_SAVE', includePrivate, timeoutSeconds, batchSize });
      if (!reply.ok || !('timeoutSeconds' in reply.value)) throw new Error('整理配置响应无效。');
      if (mounted.current) { setConfig(reply.value); setNotice('整理配置已保存。'); }
      return true;
    } catch (error: unknown) {
      if (mounted.current) setError(reason(error, '保存整理配置失败。'));
      return false;
    } finally { if (mounted.current) setSaving(false); }
  }, []);

  /**
   * 从建立草稿开始，连续步进到队列清空。
   * 中途失败时服务端已经结束本轮并抛出可读原因，这里把它原样交给界面。
   */
  const run = useCallback(async (accountId: string): Promise<ClassifyRunResult> => {
    if (active.current) return { ok: false, applied: 0, categoriesCreated: 0, message: '整理已经在进行中。' };
    active.current = true;
    if (mounted.current) { setRunning(true); setProgress({ processed: 0, total: 0 }); }
    try {
      const started = await request({ type: 'AI_CLASSIFY_START', accountId });
      if (!started.ok || !('draft' in started.value)) throw new Error('分类状态响应无效。');
      let current = started.value;
      if (mounted.current) {
        setState(current);
        setProgress({ processed: current.draft?.processed ?? 0, total: current.draft?.queue.length ?? 0 });
      }
      while (current.draft && current.draft.state === 'running' && mounted.current) {
        const reply = await request({ type: 'AI_CLASSIFY_STEP', accountId });
        if (!reply.ok || !('draft' in reply.value)) throw new Error('分类状态响应无效。');
        current = reply.value;
        if (mounted.current) {
          setState(current);
          setProgress(previous => ({
            processed: current.draft?.processed ?? previous.processed,
            total: current.draft?.queue.length ?? previous.total,
          }));
        }
      }
      return { ok: true, applied: current.result?.applied ?? 0, categoriesCreated: current.result?.categoriesCreated ?? 0, message: '' };
    } catch (error: unknown) {
      return { ok: false, applied: 0, categoriesCreated: 0, message: reason(error, '整理失败，请重试。') };
    } finally {
      active.current = false;
      if (mounted.current) setRunning(false);
    }
  }, []);

  const clearError = useCallback(() => setError(''), []);
  const clearNotice = useCallback(() => setNotice(''), []);
  return {
    state, prompt, defaults, config, error, notice, saving, running, progress,
    read, readPrompt, savePrompt, readConfig, saveConfig, run, clearError, clearNotice,
  };
}

export type ClassifyController = ReturnType<typeof useClassify>;
