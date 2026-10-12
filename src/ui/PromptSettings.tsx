import { useEffect, useState } from 'react';
import { FIXED_CONTRACT, MAX_PROMPT_LENGTH } from '../ai/preferences';
import { InfoTip } from './InfoTip';
import { useDebouncedEffect } from './use-debounced-effect';
import type { ClassifyController } from './use-ai';

/**
 * AI 设置里的提示词面板。改动在停止输入后自动保存，没有保存按钮。
 * 固定契约只在界面展示、不可编辑；可编辑部分是分类准则与用户提示词。
 */
export function PromptSettings({ classify }: { classify: ClassifyController }) {
  const [guideline, setGuideline] = useState<string | null>(null);
  const [user, setUser] = useState<string | null>(null);
  const readPrompt = classify.readPrompt;
  useEffect(() => { void readPrompt(); }, [readPrompt]);
  const current = classify.prompt;
  const value = {
    guideline: guideline ?? current?.systemGuideline ?? '',
    user: user ?? current?.userPrompt ?? '',
  };
  const dirty = !!current && (value.guideline !== current.systemGuideline || value.user !== current.userPrompt);
  const save = classify.savePrompt;
  useDebouncedEffect(() => {
    if (dirty) void save(value.guideline, value.user);
  }, 800, [value.guideline, value.user, dirty]);
  const restore = () => {
    setGuideline(classify.defaults?.systemGuideline ?? '');
    setUser(classify.defaults?.userPrompt ?? '');
  };

  return <>
    <header className="settings-panel-head">
      <h2 id="settings-ai-prompt-title">分类提示词</h2>
      <p>停止输入后自动保存，不需要手动提交。</p>
    </header>
    <div className="settings-panel-body">
      <fieldset className="settings-fieldset" disabled={classify.saving || !current}>
        <legend><span className="legend-row">提示词
          <InfoTip label="提示词分层说明">扩展把固定的输出契约与安全约束拼在分类准则前面。契约部分不随提示词改变，改坏准则只会让结果不合要求，不会放宽边界。</InfoTip>
        </span></legend>
        <div className="field">
          <div className="field-label"><label htmlFor="ai-guideline">系统提示词 · 分类准则</label></div>
          <textarea id="ai-guideline" className="field-input prompt-input" rows={6} maxLength={MAX_PROMPT_LENGTH}
            value={value.guideline} onChange={event => { setGuideline(event.target.value); classify.clearError(); }} />
          <p className="field-help">描述希望怎样分类，例如粒度、命名语言与业务准则。{value.guideline.length} / {MAX_PROMPT_LENGTH}</p>
        </div>
        <div className="field">
          <div className="field-label"><label htmlFor="ai-user-prompt">用户提示词 · 附加要求</label></div>
          <textarea id="ai-user-prompt" className="field-input prompt-input" rows={4} maxLength={MAX_PROMPT_LENGTH}
            value={value.user} onChange={event => { setUser(event.target.value); classify.clearError(); }} />
          <p className="field-help">作为附加要求追加到本次请求，可留空。{value.user.length} / {MAX_PROMPT_LENGTH}</p>
        </div>
        <div className="action-row settings-actions">
          <button className="button secondary" type="button" disabled={!current} onClick={restore}>恢复默认</button>
        </div>
      </fieldset>
      <details className="contract-details">
        <summary>查看固定的输出契约与安全约束</summary>
        <pre>{FIXED_CONTRACT}</pre>
      </details>
      <p className="inline-status" role="status" aria-live="polite">{classify.saving ? '正在保存…' : classify.notice}</p>
      {classify.error && <p className="inline-error" role="alert">{classify.error}</p>}
    </div>
  </>;
}
