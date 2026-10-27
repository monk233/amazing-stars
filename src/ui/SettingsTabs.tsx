import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import type { Appearance } from '../data/types';
import { AppearanceSettings } from './AppearanceSettings';
import { GitSettings } from './GitSettings';
import { AiSettings } from './AiSettings';
import { DataBoundary } from './DataBoundary';
import type { GitController } from './use-git';

type TabId = 'appearance' | 'git' | 'ai' | 'boundary';
const TABS: { id: TabId; label: string }[] = [
  { id: 'appearance', label: '外观' },
  { id: 'git', label: 'Git' },
  { id: 'ai', label: 'AI 服务' },
  { id: 'boundary', label: '数据边界' },
];

/**
 * Settings index: a contents column in the sheet's margin on wide screens, one scrolling
 * line above the record on narrow ones. Only the selected panel mounts; arrow keys,
 * Home and End move between entries with a roving tabindex.
 */
export function SettingsTabs({ appearance, saving, onChange, git }: {
  appearance: Appearance | undefined;
  saving: boolean;
  onChange: (patch: Partial<Appearance>) => void;
  git: GitController;
}) {
  const [tab, setTab] = useState<TabId>(TABS[0]!.id);
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => { root.current?.closest('.document-view')?.scrollTo({ top: 0 }); }, [tab]);

  const select = (index: number) => {
    const next = TABS[(index + TABS.length) % TABS.length]!;
    setTab(next.id);
    buttons.current[TABS.indexOf(next)]?.focus();
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') { event.preventDefault(); select(index + 1); }
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') { event.preventDefault(); select(index - 1); }
    else if (event.key === 'Home') { event.preventDefault(); select(0); }
    else if (event.key === 'End') { event.preventDefault(); select(TABS.length - 1); }
  };

  const panels: Record<TabId, ReactNode> = {
    appearance: <AppearanceSettings appearance={appearance} saving={saving} onChange={onChange} />,
    git: <GitSettings git={git} />,
    ai: <AiSettings />,
    boundary: <DataBoundary />,
  };
  const active = TABS.find(item => item.id === tab) ?? TABS[0]!;

  return <div className="settings-shell" ref={root}>
    <div className="settings-tabs settings-index" role="tablist" aria-label="设置分区">
      {TABS.map((item, index) => <button
        key={item.id} type="button" role="tab" className="settings-tab" id={'settings-tab-' + item.id}
        aria-selected={tab === item.id} aria-controls={'settings-tabpanel-' + item.id}
        tabIndex={tab === item.id ? 0 : -1}
        ref={node => { buttons.current[index] = node; }}
        onClick={() => setTab(item.id)} onKeyDown={event => onKeyDown(event, index)}>
        {item.label}
      </button>)}
    </div>
    <div className="settings-content">
      <div className="settings-panel" role="tabpanel" id={'settings-tabpanel-' + active.id}
        aria-labelledby={'settings-tab-' + active.id} tabIndex={0}>
        {panels[active.id]}
      </div>
    </div>
  </div>;
}
