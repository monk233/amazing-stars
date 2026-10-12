import { useGit } from '../../src/ui/use-git';
import { useClassify } from '../../src/ui/use-ai';
import { WorkspaceShell } from '../../src/ui/WorkspaceShell';
import { SettingsTabs } from '../../src/ui/SettingsTabs';
import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom/client';
import { useWorkspaceStatus } from '../../src/ui/use-workspace-status';
import type { Appearance } from '../../src/data/types';
import '../../src/ui/tokens.css';
import '../../src/ui/settings.css';

// Anything starting with #settings keeps the settings route; other hashes fall back to the library.
const routeFromHash = () => location.hash.startsWith('#settings') ? 'settings' : 'library';

function App() {
  const git = useGit();
  const classify = useClassify();
  const { status, error, saving, load, saveAppearance } = useWorkspaceStatus();
  const [route, setRoute] = useState(routeFromHash);
  useEffect(() => {
    const onHash = () => setRoute(routeFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  const appearance = status?.settings.appearance;
  const change = (patch: Partial<Appearance>) => { if (appearance) void saveAppearance({ ...appearance, ...patch }); };
  return <WorkspaceShell git={git} classify={classify} route={route} notice={<>
    {error && <div role="alert" className="error">{error} <button className="button secondary" onClick={() => void load()}>重试</button></div>}
  </>}>
    {status ? <div className="settings-page">
      <SettingsTabs appearance={appearance} saving={saving} onChange={change} git={git} classify={classify} />
    </div> : !error ? <div className="settings-skeleton" role="status" aria-label="正在打开本地工作区">
      <span className="skeleton-tabs" /><span className="skeleton-title" /><span className="skeleton-line" />
      <span className="skeleton-cards"><span /><span /></span>
    </div> : null}
  </WorkspaceShell>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
