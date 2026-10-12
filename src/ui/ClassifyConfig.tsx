import { useEffect, useState } from 'react';
import { MAX_BATCH_SIZE, MIN_BATCH_SIZE, isBatchSize } from '../ai/classification';
import { MAX_TIMEOUT_SECONDS, MIN_TIMEOUT_SECONDS, isTimeout } from '../ai/prompt';
import { InfoTip } from './InfoTip';
import { useDebouncedEffect } from './use-debounced-effect';
import type { ClassifyController } from './use-ai';

/**
 * AI 服务下的「整理配置」面板：请求超时、每批整理数量与私有仓库发送范围。
 * 改动在停止输入后自动保存，没有保存按钮。
 */
export function ClassifyConfig({ classify }: { classify: ClassifyController }) {
  const [timeoutValue, setTimeoutValue] = useState<string | null>(null);
  const [batchValue, setBatchValue] = useState<string | null>(null);
  const [includePrivate, setIncludePrivate] = useState<boolean | null>(null);
  const readConfig = classify.readConfig;
  useEffect(() => { void readConfig(); }, [readConfig]);
  const current = classify.config;
  const value = {
    timeout: timeoutValue ?? String(current?.timeoutSeconds ?? ''),
    batch: batchValue ?? String(current?.batchSize ?? ''),
    includePrivate: includePrivate ?? current?.includePrivate ?? false,
  };
  const dirty = !!current && (value.timeout !== String(current.timeoutSeconds) ||
    value.batch !== String(current.batchSize) || value.includePrivate !== current.includePrivate);
  const seconds = Number(value.timeout);
  const size = Number(value.batch);
  const valid = isTimeout(seconds) && isBatchSize(size);
  const save = classify.saveConfig;
  useDebouncedEffect(() => {
    if (!dirty || !valid) return;
    void save(value.includePrivate, seconds, size);
  }, 800, [value.timeout, value.batch, value.includePrivate, dirty, valid]);

  return <>
    <header className="settings-panel-head">
      <h2 id="settings-ai-classify-title">整理配置</h2>
      <p>这三项只影响 AI 整理，不影响同步与手动分类；改动会自动保存。</p>
    </header>
    <div className="settings-panel-body">
      <fieldset className="settings-fieldset" disabled={classify.saving || !current}>
        <legend><span className="legend-row">整理范围与超时
          <InfoTip label="超时说明">单次生成请求的最长等待时间。超过后扩展停止等待并结束本轮，但服务商可能仍在处理这次请求。</InfoTip>
        </span></legend>
        <div className="field">
          <div className="field-label"><label htmlFor="ai-timeout">请求超时（秒）</label></div>
          <input id="ai-timeout" className="field-input" type="number" inputMode="numeric" required
            min={MIN_TIMEOUT_SECONDS} max={MAX_TIMEOUT_SECONDS} step={1}
            value={value.timeout} onChange={event => { setTimeoutValue(event.target.value); classify.clearError(); }} />
          <p className="field-help">{MIN_TIMEOUT_SECONDS} 到 {MAX_TIMEOUT_SECONDS} 秒之间；模型越慢、每批项目越多，需要的时间越长。</p>
        </div>
        <div className="field">
          <div className="field-label"><label htmlFor="ai-batch-size">每批整理数量</label></div>
          <input id="ai-batch-size" className="field-input" type="number" inputMode="numeric" required
            min={MIN_BATCH_SIZE} max={MAX_BATCH_SIZE} step={1}
            value={value.batch} onChange={event => { setBatchValue(event.target.value); classify.clearError(); }} />
          <p className="field-help">每次请求包含多少个项目，{MIN_BATCH_SIZE} 到 {MAX_BATCH_SIZE} 之间。数量越大，单次请求越慢、越容易触发超时。</p>
        </div>
        <div className="field">
          <div className="field-label"><span>私有仓库</span></div>
          <label className="checkbox-row" htmlFor="ai-include-private">
            <input id="ai-include-private" type="checkbox" checked={value.includePrivate}
              onChange={event => { setIncludePrivate(event.target.checked); classify.clearError(); }} />
            把私有仓库也交给 AI 分类
          </label>
          <p className="field-help">{value.includePrivate
            ? '开启后，私有项目的名称、描述、语言与 topics 会发送到 AI 服务地址。'
            : '关闭时私有项目不参与整理，也不会出现在请求里。'}</p>
        </div>
      </fieldset>
      <p className="inline-status" role="status" aria-live="polite">{classify.saving ? '正在保存…' : classify.notice}</p>
      {classify.error && <p className="inline-error" role="alert">{classify.error}</p>}
    </div>
  </>;
}
