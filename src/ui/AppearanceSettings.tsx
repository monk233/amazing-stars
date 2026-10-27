import { useEffect, useState, type CSSProperties } from 'react';
import type { Appearance, Theme } from '../data/types';
import { InfoTip } from './InfoTip';
import { ModeIcon } from './ModeIcon';
import { WorkspaceIcon } from './WorkspaceIcon';

const THEMES = [
  { value: 'folio', label: '纸页收藏馆', note: '平静、有序，像自己的编辑目录。适合阅读、手册与长期整理。' },
  { value: 'observatory', label: '轨道观测室', note: '清楚、有坐标感，像自己的探索工作台。适合对比与开发工具。' },
] as const;

const MODES = [
  { value: 'system', label: '跟随系统' },
  { value: 'light', label: '亮色' },
  { value: 'dark', label: '暗色' },
] as const;

const PALETTE_VARS = ['--color-paper', '--color-rule', '--color-rule-2', '--color-accent', '--color-grid'] as const;
type Palette = Record<(typeof PALETTE_VARS)[number], string>;

/**
 * The paper specimens paint themselves with the palette they name, so the preview is
 * honest in all four stocks. Token values are read from the sheet's own theme scopes
 * rather than repeated here; the read is synchronous and restores the document first.
 */
function readPalettes(): Record<string, Palette> | null {
  if (typeof document === 'undefined') return null;
  const root = document.documentElement;
  const savedTheme = root.dataset.theme;
  const savedMode = root.dataset.mode;
  const read = (theme: Theme, mode: 'light' | 'dark'): Palette => {
    root.dataset.theme = theme;
    root.dataset.mode = mode;
    const style = getComputedStyle(root);
    const values = {} as Palette;
    for (const name of PALETTE_VARS) values[name] = style.getPropertyValue(name).trim();
    return values;
  };
  const palettes = {
    'folio:light': read('folio', 'light'),
    'folio:dark': read('folio', 'dark'),
    'observatory:light': read('observatory', 'light'),
    'observatory:dark': read('observatory', 'dark'),
  };
  if (savedTheme) root.dataset.theme = savedTheme; else delete root.dataset.theme;
  if (savedMode) root.dataset.mode = savedMode; else delete root.dataset.mode;
  return palettes;
}

export function AppearanceSettings({ appearance, saving, onChange }: {
  appearance: Appearance | undefined;
  saving: boolean;
  onChange: (patch: Partial<Appearance>) => void;
}) {
  const disabled = !appearance || saving;
  const status = saving ? '正在保存外观设置…' : appearance ? '外观设置已保存。' : '正在读取外观设置…';
  const [palettes, setPalettes] = useState<Record<string, Palette> | null>(null);
  useEffect(() => { setPalettes(readPalettes()); }, []);
  const systemDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const resolvedMode = appearance?.mode === 'dark' || (appearance?.mode !== 'light' && systemDark) ? 'dark' : 'light';
  const sampleStyle = (theme: Theme): CSSProperties => {
    const palette = palettes?.[theme + ':' + resolvedMode];
    if (!palette) return {};
    return {
      '--sample-paper': palette['--color-paper'],
      '--sample-line': palette['--color-rule'],
      '--sample-rule': palette['--color-rule-2'],
      '--sample-accent': palette['--color-accent'],
      '--sample-grid': palette['--color-grid'],
    } as CSSProperties;
  };
  return <>
    <header className="settings-panel-head">
      <h2 id="settings-appearance-title">外观</h2>
    </header>
    <div className="settings-panel-body">
      <div className="theme-groups">
        <fieldset className="settings-fieldset" disabled={disabled}>
          <legend><span className="settings-legend">主题<InfoTip label="外观作用范围">主题与明暗模式只影响这台设备上的显示，不修改任何远端数据。</InfoTip></span></legend>
          <div className="theme-choices">
            {THEMES.map(theme => <label className="theme-choice" data-preview={theme.value} key={theme.value} style={sampleStyle(theme.value)}>
              <input type="radio" name="theme" value={theme.value}
                checked={appearance?.theme === theme.value} onChange={() => onChange({ theme: theme.value })} />
              <span className="theme-sample" aria-hidden="true"><i /><i /><i /><i /><i className="theme-sample-mark" /></span>
              <span className="theme-choice-copy">
                <span className="theme-choice-name">{theme.label}<span className="theme-check" aria-hidden="true"><WorkspaceIcon name="check" /></span></span>
                <span className="theme-choice-note">{theme.note}</span>
              </span>
            </label>)}
          </div>
        </fieldset>
        <fieldset className="settings-fieldset" disabled={disabled}>
          <legend><span className="settings-legend">明暗模式</span></legend>
          <div className="mode-segments">
            {MODES.map(mode => <label className="mode-segment" key={mode.value}>
              <input type="radio" name="mode" value={mode.value}
                checked={appearance?.mode === mode.value} onChange={() => onChange({ mode: mode.value })} />
              <ModeIcon mode={mode.value} /><span>{mode.label}</span>
            </label>)}
          </div>
        </fieldset>
      </div>
      <p className="inline-status" role="status" aria-live="polite">
        {appearance && !saving && <WorkspaceIcon name="check" />}{status}
      </p>
    </div>
  </>;
}
