import type { GitController } from './use-git';
import { useEffect, useMemo, useRef, useState, type DragEvent, type ReactNode } from 'react';
import type { List, Repository } from '../data/types';
import { filterRepositories, initialFilters, repositoryUrl, type Filters, type Library as LibraryData } from '../library/library';
import { request } from './client';
import { Brand, StarMark } from './Brand';
import { InfoTip } from './InfoTip';
import { WorkspaceIcon } from './WorkspaceIcon';
import { SelectMenu } from './SelectMenu';
import './library.css';

function formattedDate(value: string | null): string {
  if (!value || Number.isNaN(Date.parse(value))) return '暂无记录';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value));
}
function ProjectDetail({ repo, data, onClose, onMove }: {
  repo: Repository; data: LibraryData; onClose: () => void; onMove: (repositoryId: string, categoryId: string | null) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const tags = data.tags.filter(tag => data.repositoryTags.some(link => link.repositoryId === repo.id && link.tagId === tag.id));
  const lists = data.lists.filter(list => data.memberships.some(link => link.repositoryId === repo.id && link.listId === list.id));
  const url = repositoryUrl(repo.fullName);
  const [owner, name] = repo.fullName.split('/');
  return <section aria-labelledby="project-title" className="entry">
    <button className="back-link" type="button" onClick={onClose}><WorkspaceIcon name="chevron" />返回收藏</button>
    <header className="entry-head">
      <span className="entry-seal" aria-hidden="true">{(name || owner || '').slice(0, 2)}</span>
      <div className="entry-identity">
        <span className="entry-owner">{owner} /</span>
        <h1 id="project-title" ref={heading} tabIndex={-1}>{name || owner}</h1>
        <p className="entry-description">{repo.description || '该项目暂无描述。'}</p>
      </div>
      {url && <a className="button secondary entry-open" href={url} target="_blank" rel="noopener noreferrer">打开仓库<WorkspaceIcon name="external"/></a>}
    </header>
    <div className="entry-body">
      <article className="entry-facts">
        <h2 className="entry-subhead">项目信息<InfoTip label="数据来源说明">以上信息来自本地快照，可能与远端当前状态不同。</InfoTip></h2>
        <dl className="facts">
          <div><dt>主要语言</dt><dd>{repo.language || '未标注'}</dd></div>
          <div><dt>可见性</dt><dd>{repo.visibility === 'private' ? '私有' : '公开'}</dd></div>
          <div><dt>项目状态</dt><dd>{repo.archived ? '已归档' : '未归档'}</dd></div>
          <div><dt>收藏时间</dt><dd className="num">{formattedDate(repo.starredAt)}</dd></div>
          <div><dt>最近推送</dt><dd className="num">{formattedDate(repo.pushedAt)}</dd></div>
          <div><dt>本地快照</dt><dd className="num">{formattedDate(repo.fetchedAt)}</dd></div>
        </dl>
        <h2 className="entry-subhead">Topics</h2>
        <div className="tags">{repo.topics.length ? repo.topics.map(topic => <span className="tag" key={topic}>{topic}</span>) : <span className="note">暂无 Topics。</span>}</div>
      </article>
      <aside className="entry-margin" aria-labelledby="entry-local-title">
        <h2 id="entry-local-title" className="entry-subhead">它在我的收藏里</h2>
        <div className="dimension">
          <h3>分类</h3>
          <div className="tags">{lists.length ? lists.map(list => <span className="tag" key={list.id}>{list.name}</span>) : <span className="note">尚未归入分类。</span>}</div>
          <div className="category-assign">
            <SelectMenu label="移动到分类" value={lists[0]?.id ?? ''}
              options={[{ value: '', label: '移出所有分类' }, ...data.lists.filter(list => list.id !== lists[0]?.id).map(list => ({ value: list.id, label: list.name }))]}
              onChange={value => onMove(repo.id, value || null)} />
          </div>
        </div>
        {data.dimensions.map(dimension => {
          const assigned = tags.filter(tag => tag.dimensionId === dimension.id);
          return assigned.length ? <div className="dimension" key={dimension.id}><h3>{dimension.name}</h3><div className="tags">{assigned.map(tag => <span className="tag" key={tag.id} title={data.repositoryTags.find(link => link.repositoryId === repo.id && link.tagId === tag.id)?.source === 'ai' ? 'AI 分类' : '手动标记'}>{tag.name}</span>)}</div></div> : null;
        })}
        {!tags.length && <p className="note">尚未添加本地标签。</p>}
        <p className="local-note"><WorkspaceIcon name="lock"/>分类、维度与标签仅保存在本地</p>
      </aside>
    </div>
  </section>;
}

interface Editor { id: string | null; name: string; description: string }

export function Library({ route, children, notice, git }: { git: GitController; route: string; children: ReactNode; notice: ReactNode }) {
  const [data, setData] = useState<LibraryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Repository | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [editorBusy, setEditorBusy] = useState(false);
  const [confirming, setConfirming] = useState('');
  const [dragging, setDragging] = useState('');
  const [dropTarget, setDropTarget] = useState('');
  const main = useRef<HTMLElement>(null);
  const resultsPane = useRef<HTMLDivElement>(null);
  const filterPanel = useRef<HTMLDetailsElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const categoryDialog = useRef<HTMLDivElement>(null);
  const categoryNameInput = useRef<HTMLInputElement>(null);
  const savedScroll = useRef(0);
  const fitFilterPanel = () => {
    const panel = filterPanel.current;
    const summary = panel?.querySelector('summary');
    if (panel?.open && summary) panel.style.setProperty('--filter-space', Math.max(100, window.innerHeight - summary.getBoundingClientRect().bottom - 24) + 'px');
  };
  useEffect(() => { if (resultsPane.current) resultsPane.current.scrollTop = savedScroll.current; }, [route, selected?.id]);
  useEffect(() => { resultsPane.current?.scrollTo({ top: 0 }); }, [page, filters]);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (filterPanel.current && !filterPanel.current.contains(event.target as Node)) filterPanel.current.open = false;
    };
    const shortcut = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k' && searchInput.current) {
        event.preventDefault(); searchInput.current.focus();
      }
    };
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', shortcut);
    window.addEventListener('resize', fitFilterPanel);
    return () => { document.removeEventListener('pointerdown', dismiss); document.removeEventListener('keydown', shortcut); window.removeEventListener('resize', fitFilterPanel); };
  }, []);
  // 分类编辑走模态框：打开后聚焦名称输入，Esc 关闭，Tab 在框内循环。
  const editorKey = editor ? editor.id ?? '__new' : '';
  useEffect(() => {
    if (!editorKey) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    categoryNameInput.current?.focus();
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') { event.preventDefault(); setConfirming(''); setEditor(null); return; }
      if (event.key !== 'Tab') return;
      const items = [...(categoryDialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href]') ?? [])];
      if (!items.length) return;
      const first = items[0]!; const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => { document.removeEventListener('keydown', onKeyDown, true); opener?.focus(); };
  }, [editorKey]);
  useEffect(() => { if (main.current) main.current.scrollTop = 0; }, [route, selected?.id]);
  const generation = useRef(0);
  const account = useRef<string | null>(null);
  async function load(accountId: string | null, reset = true) {
    const current = ++generation.current;
    account.current = accountId;
    savedScroll.current = 0;
    setLoading(true); setError('');
    // 切换账号或首次读取时重置视图；分类操作后的刷新保留当前筛选与滚动位置。
    if (reset) { setData(null); setSelected(null); setFilters(initialFilters); setPage(1); setEditor(null); }
    try {
      const reply = await request({ type: 'LIBRARY_READ', accountId });
      if (!reply.ok || !('kind' in reply.value) || reply.value.kind !== 'library') throw new Error('收藏数据格式不正确，请重试。');
      if (generation.current === current) { setData(reply.value); account.current = reply.value.accountId; }
    } catch (reason: unknown) {
      if (generation.current === current) setError(reason instanceof Error ? reason.message : '收藏读取失败，请重试。');
    } finally { if (generation.current === current) setLoading(false); }
  }
  useEffect(() => { void load(account.current, false); return () => { generation.current++; }; }, [git.refreshKey]);
  const results = useMemo(() => data ? filterRepositories(data, filters) : [], [data, filters]);
  const languages = [...new Set(data?.repositories.flatMap(repo => repo.language ? [repo.language] : []) ?? [])].sort();
  const change = (patch: Partial<Filters>) => { setFilters(previous => ({ ...previous, ...patch })); setPage(1); };
  const reset = () => { setFilters(initialFilters); setPage(1); };
  const hasFilters = filters.query.trim() || filters.listId || filters.language || filters.visibility || filters.archived || filters.tagIds.length;
  const pages = Math.max(1, Math.ceil(results.length / 40));
  const goLibrary = (listId = filters.listId) => { setSelected(null); change({ listId }); location.hash = 'library'; };
  const closeDetail = () => { const id = selected?.id; setSelected(null); requestAnimationFrame(() => { if (id) document.getElementById('repository-' + id)?.focus(); }); };
  const openDetail = (repo: Repository) => { savedScroll.current = resultsPane.current?.scrollTop ?? 0; setSelected(repo); };
  const isDetail = route !== 'settings' && !!selected;
  const activeAccount = data?.accounts.find(item => item.accountId === data.accountId);
  const connection = git.state?.accounts.find(item => item.account.accountId === data?.accountId);
  const selectedCategory = data?.lists.find(list => list.id === filters.listId);
  const categoryName = filters.listId === '__unlisted' ? '未分类' : selectedCategory?.name ?? '所有收藏';
  const listOptions = [{ value: '', label: '所有收藏' }, ...(data?.lists.map(list => ({ value: list.id, label: list.name })) ?? []), { value: '__unlisted', label: '未分类' }];
  const extraCount = [filters.language, filters.visibility, filters.archived].filter(Boolean).length + filters.tagIds.length;
  const listCounts = new Map<string, Set<string>>();
  const listed = new Set<string>();
  data?.memberships.forEach(link => {
    const entries = listCounts.get(link.listId) ?? new Set<string>();
    entries.add(link.repositoryId); listCounts.set(link.listId, entries); listed.add(link.repositoryId);
  });
  const unlistedCount = data?.repositories.filter(repo => !listed.has(repo.id)).length ?? 0;
  const syncRunning = connection?.sync?.state === 'running';
  const syncLabel = syncRunning ? '同步中…' : connection?.connected ? '同步收藏' : '连接 Git 账号';
  const providerLabel = connection?.provider === 'gitee' ? 'Gitee' : 'GitHub';

  const moveTo = (repositoryId: string, categoryId: string | null) => {
    if (!data?.accountId) return;
    void git.send({ type: 'GIT_CATEGORY_MOVE', accountId: data.accountId, repositoryId, categoryId });
  };
  const saveCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!editor || !data?.accountId) return;
    setEditorBusy(true);
    const ok = await git.send({ type: 'GIT_CATEGORY_SAVE', accountId: data.accountId, id: editor.id, name: editor.name, description: editor.description });
    setEditorBusy(false);
    if (ok) setEditor(null);
  };
  const closeEditor = () => { setConfirming(''); setEditor(null); };
  const removeCategory = async (categoryId: string) => {
    if (!data?.accountId) return;
    setEditorBusy(true);
    const ok = await git.send({ type: 'GIT_CATEGORY_DELETE', accountId: data.accountId, categoryId });
    setEditorBusy(false);
    if (!ok) return;
    setEditor(null); setConfirming('');
    if (filters.listId === categoryId) change({ listId: '' });
  };
  const dropProps = (targetId: string, categoryId: string | null) => ({
    onDragOver: (event: DragEvent) => { if (!dragging) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; if (dropTarget !== targetId) setDropTarget(targetId); },
    onDragLeave: (event: DragEvent) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDropTarget(current => current === targetId ? '' : current); },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      const repositoryId = event.dataTransfer.getData('text/plain') || dragging;
      setDropTarget(''); setDragging('');
      if (repositoryId) moveTo(repositoryId, categoryId);
    },
  });
  const categoryRow = (list: List) => <div key={list.id} className={'rail-item' + (dropTarget === list.id ? ' drop-target' : '')} {...dropProps(list.id, list.id)}>
    <button type="button" className="rail-entry" aria-pressed={filters.listId === list.id} onClick={() => goLibrary(list.id)}>
      <WorkspaceIcon name="folder" /><span className="rail-name" title={list.description || list.name}>{list.name}</span><span className="rail-leader" aria-hidden="true" /><span className="rail-count num">{listCounts.get(list.id)?.size ?? 0}</span>
    </button>
    <button type="button" className="rail-edit" aria-label={'编辑分类：' + list.name}
      onClick={() => { setConfirming(''); setEditor({ id: list.id, name: list.name, description: list.description ?? '' }); }}>
      <WorkspaceIcon name="edit" />
    </button>
  </div>;

  const ledgerLabel = filters.sort === 'updated' ? '推送时间' : '收藏时间';
  return <div className="app">
    <div className="app-frame">
      <aside className="rail" aria-label="工作区导航">
        <a href="#library" className="brand-link" onClick={() => goLibrary('')}><Brand /></a>
        <span className="brand-caption">你的开源收藏馆</span>
        <nav className="rail-nav" aria-label="主导航">
          <a className="rail-entry rail-entry-main" href="#library" onClick={() => goLibrary('')} aria-current={route === 'library' && !selected && !filters.listId ? 'page' : undefined}>
            <WorkspaceIcon name="collection" /><span className="rail-name">所有收藏</span><span className="rail-leader" aria-hidden="true" /><span className="rail-count num">{data?.repositories.length ?? '—'}</span>
          </a>
        </nav>
        <div className="rail-section">
          <div className="rail-head"><h2 className="rail-title">分类</h2><span className="rail-head-side"><span className="rail-total num">{data?.lists.length ?? 0}</span>
            <button type="button" className="rail-add" aria-label="新建分类" title="新建分类" disabled={!data?.accountId}
              onClick={() => { setConfirming(''); setEditor({ id: null, name: '', description: '' }); }}>
              <WorkspaceIcon name="plus" />
            </button></span></div>
          <div className="rail-list" aria-label="分类列表">
            {data?.lists.map(categoryRow)}
            {!data?.lists.length && <p className="rail-empty">还没有分类。手动新建，或在 Git 设置里选择「同步 Stars 与 Lists」。</p>}
          </div>
          <p className="rail-hint">把项目拖到左侧分类即可移动；触屏或键盘可用项目详情里的「移动到分类」。</p>
          <div className={'rail-item rail-unlisted' + (dropTarget === '__unlisted' ? ' drop-target' : '')} {...dropProps('__unlisted', null)}>
            <button type="button" className="rail-entry" aria-pressed={filters.listId === '__unlisted'} onClick={() => goLibrary('__unlisted')}>
              <WorkspaceIcon name="repository" /><span className="rail-name">未分类</span><span className="rail-leader" aria-hidden="true" /><span className="rail-count num">{unlistedCount}</span>
            </button>
          </div>
        </div>
        <div className="rail-foot">
          <a className="rail-settings" href="#settings" aria-current={route === 'settings' ? 'page' : undefined}><WorkspaceIcon name="settings" /><span className="rail-settings-label">设置与偏好</span></a>
          <div className="rail-account"><span className="avatar" aria-hidden="true">{activeAccount?.login.slice(0, 1).toUpperCase() || 'A'}</span><div className="rail-account-copy">
            {data?.accounts.length ? <SelectMenu label="本地账号" value={data.accountId ?? ''} options={data.accounts.map(item => ({ value: item.accountId, label: item.login }))} onChange={value => void load(value)} /> : <strong className="rail-account-name">本地工作区</strong>}
            <small className="rail-connection"><i className={connection?.connected ? 'connection-dot connected' : 'connection-dot'} />{activeAccount ? connection?.connected ? providerLabel + ' 已连接' : '本地快照' : '尚未连接 Git 账号'}</small>
          </div></div>
        </div>
      </aside>
      <main ref={main} className={'sheet' + (route === 'settings' || isDetail ? ' document-view' : '')}>
        {notice}
        {route === 'settings' ? <div className="document">
          <header className="page-head">
            <div className="page-head-copy"><h1>设置与偏好</h1><p>管理外观、Git 连接、AI 服务与数据边界。</p></div>
            <a className="button secondary" href="#library">返回收藏</a>
          </header>
          <div className="settings-page">{children}</div>
        </div>
          : isDetail && selected && data ? <div className="document">
            <ProjectDetail repo={selected} data={data} onClose={closeDetail} onMove={moveTo} />
          </div>
            : <section className="library" aria-labelledby="library-title">
              {editor && <div className="dialog-backdrop" onPointerDown={event => { if (event.target === event.currentTarget) closeEditor(); }}>
                <div className="category-dialog" ref={categoryDialog} role="dialog" aria-modal="true" aria-labelledby="category-editor-title">
                  <div className="dialog-head">
                    <h2 id="category-editor-title">{editor.id ? '编辑分类' : '新建分类'}</h2>
                    <button type="button" className="icon-button" aria-label="关闭分类编辑" onClick={closeEditor}><WorkspaceIcon name="close" /></button>
                  </div>
                  <form onSubmit={event => void saveCategory(event)}>
                    <div className="field">
                      <div className="field-label"><label htmlFor="category-name">分类名称</label></div>
                      <input id="category-name" ref={categoryNameInput} className="field-input" maxLength={80} required value={editor.name}
                        onChange={event => setEditor({ ...editor, name: event.target.value })} />
                    </div>
                    <div className="field">
                      <div className="field-label"><label htmlFor="category-description">分类说明</label></div>
                      <textarea id="category-description" className="field-input" rows={3} maxLength={500} value={editor.description}
                        placeholder="记录这个分类的范围、用法或来源" onChange={event => setEditor({ ...editor, description: event.target.value })} />
                    </div>
                    <div className="action-row dialog-actions">
                      <button className="button" type="submit" disabled={editorBusy || !editor.name.trim()}>{editorBusy ? '保存中…' : '保存分类'}</button>
                      <button className="button secondary" type="button" onClick={closeEditor}>取消</button>
                      {editor.id && (confirming === editor.id
                        ? <>
                          <button className="button danger confirming dialog-delete" type="button" disabled={editorBusy} onClick={() => void removeCategory(editor.id!)}>确认删除</button>
                          <button className="button secondary" type="button" onClick={() => setConfirming('')}>保留分类</button>
                        </>
                        : <button className="button danger dialog-delete" type="button" onClick={() => setConfirming(editor.id!)}>删除分类</button>)}
                    </div>
                    <p className="field-help dialog-help">删除分类后，其中的项目会回到「未分类」；项目标签与笔记不受影响。远端同步来的分类下次同步可能重新出现。</p>
                  </form>
                </div>
                <footer className="library-footer"><span className="footer-note"><WorkspaceIcon name="lock" />本地收藏快照</span>{pages > 1 ? <nav className="pager" aria-label="收藏分页"><button className="icon-button pager-prev" aria-label="上一页" disabled={page === 1} onClick={() => setPage(value => value - 1)}><WorkspaceIcon name="chevron" /></button><span className="num" role="status">{page} / {pages}</span><button className="icon-button" aria-label="下一页" disabled={page === pages} onClick={() => setPage(value => value + 1)}><WorkspaceIcon name="chevron" /></button></nav> : <span className="footer-note num">{data?.repositories.length ?? 0} 个收藏</span>}</footer>
              </div>}
              <header className="library-head">
                <div className="title-block">
                  <h1 id="library-title">{categoryName}</h1>
                  <span className="count-block"><span className="count-figure num">{data ? results.length : '—'}</span><span className="count-label">个收藏</span></span>
                  {selectedCategory?.description && <p className="category-description">{selectedCategory.description}</p>}
                  <p className="sync-caption" role="status">{syncRunning ? '正在同步，当前展示上次快照' : activeAccount?.lastSyncedAt ? '上次同步 ' + formattedDate(activeAccount.lastSyncedAt) : '从 ' + providerLabel + ' 同步你的开源收藏'}</p>
                </div>
                <button className="button sync-button" disabled={loading || git.busy || syncRunning} onClick={() => {
                  if (connection?.connected) void git.send({ type: 'GIT_SYNC', accountId: connection.account.accountId }); else location.hash = 'settings';
                }}><WorkspaceIcon name="refresh" />{syncLabel}</button>
              </header>
              <div className="toolbar">
                <label className="search"><WorkspaceIcon name="search" /><input ref={searchInput} aria-label="搜索收藏" type="search" placeholder="搜索项目、描述或标签…" value={filters.query} disabled={!data?.repositories.length} onChange={event => change({ query: event.target.value })} /><kbd>Ctrl K</kbd></label>
                <div className="mobile-category"><SelectMenu label="分类" value={filters.listId} options={listOptions} onChange={value => change({ listId: value })} /></div>
                <details className="filters" ref={filterPanel} onToggle={fitFilterPanel} onKeyDown={event => {
                  if (event.key === 'Escape') { event.preventDefault(); event.currentTarget.open = false; event.currentTarget.querySelector('summary')?.focus(); }
                }}>
                  <summary className="filter-toggle"><WorkspaceIcon name="filter" />筛选{extraCount > 0 && <span className="filter-count num">{extraCount}</span>}</summary>
                  <div className="filter-panel">
                    <div className="filter-head"><h2>筛选收藏<InfoTip label="标签组合说明">同一维度满足任一标签，不同维度需同时满足。</InfoTip></h2><button className="icon-button" type="button" aria-label="关闭筛选" onClick={() => { if (filterPanel.current) { filterPanel.current.open = false; filterPanel.current.querySelector('summary')?.focus(); } }}><WorkspaceIcon name="close" /></button></div>
                    <fieldset disabled={loading || !data?.repositories.length} className="filter-fields"><legend className="visually-hidden">项目条件</legend>
                      <div><span>主要语言</span><SelectMenu label="主要语言" value={filters.language} disabled={loading || !data?.repositories.length} options={[{ value: '', label: '全部语言' }, ...languages.map(language => ({ value: language, label: language })), { value: '__none', label: '未标注语言' }]} onChange={value => change({ language: value })} /></div>
                      <div><span>可见性</span><SelectMenu label="可见性" value={filters.visibility} disabled={loading || !data?.repositories.length} options={[{ value: '', label: '公开与私有' }, { value: 'public', label: '公开' }, { value: 'private', label: '私有' }]} onChange={value => change({ visibility: value })} /></div>
                      <div><span>项目状态</span><SelectMenu label="项目状态" value={filters.archived} disabled={loading || !data?.repositories.length} options={[{ value: '', label: '全部状态' }, { value: 'false', label: '未归档' }, { value: 'true', label: '已归档' }]} onChange={value => change({ archived: value })} /></div>
                    </fieldset>
                    <div className="tag-filters" aria-label="多维标签筛选">
                      {data?.dimensions.map(dimension => <fieldset className="dimension" key={dimension.id} disabled={loading || !data.repositories.length}><legend>{dimension.name}</legend><div className="tags">
                        {data.tags.filter(tag => tag.dimensionId === dimension.id).map(tag => <button className="tag tag-filter" key={tag.id} aria-pressed={filters.tagIds.includes(tag.id)} onClick={() => change({ tagIds: filters.tagIds.includes(tag.id) ? filters.tagIds.filter(id => id !== tag.id) : [...filters.tagIds, tag.id] })}>{filters.tagIds.includes(tag.id) && <WorkspaceIcon name="check" />}{tag.name}</button>)}
                      </div>{!data.tags.some(tag => tag.dimensionId === dimension.id) && <p className="note">暂无标签</p>}</fieldset>)}
                    </div>
                    <div className="filter-foot"><button className="small-link" disabled={!extraCount} onClick={() => change({ language: '', visibility: '', archived: '', tagIds: [] })}>重置条件</button></div>
                  </div>
                </details>
                <div className="sort-field"><SelectMenu label="排序" value={filters.sort} disabled={!data?.repositories.length} options={[{ value: 'starred', label: '最近收藏' }, { value: 'updated', label: '最近推送' }, { value: 'name', label: '项目名称' }]} onChange={value => change({ sort: value as Filters['sort'] })} /></div>
              </div>
              {!!hasFilters && <div className="active-filters" aria-label="已选条件">
                {filters.query.trim() && <button className="filter-chip" onClick={() => change({ query: '' })} aria-label="移除关键词">“{filters.query.trim()}”<WorkspaceIcon name="close" /></button>}
                {filters.listId && <button className="filter-chip" onClick={() => change({ listId: '' })} aria-label="移除分类">{categoryName}<WorkspaceIcon name="close" /></button>}
                {filters.language && <button className="filter-chip" onClick={() => change({ language: '' })} aria-label="移除语言">{filters.language === '__none' ? '未标注语言' : filters.language}<WorkspaceIcon name="close" /></button>}
                {filters.visibility && <button className="filter-chip" onClick={() => change({ visibility: '' })} aria-label="移除可见性">{filters.visibility === 'private' ? '私有' : '公开'}<WorkspaceIcon name="close" /></button>}
                {filters.archived && <button className="filter-chip" onClick={() => change({ archived: '' })} aria-label="移除项目状态">{filters.archived === 'true' ? '已归档' : '未归档'}<WorkspaceIcon name="close" /></button>}
                {filters.tagIds.map(id => <button className="filter-chip" key={id} onClick={() => change({ tagIds: filters.tagIds.filter(tag => tag !== id) })} aria-label={'移除标签 ' + data?.tags.find(tag => tag.id === id)?.name}>{data?.tags.find(tag => tag.id === id)?.name}<WorkspaceIcon name="close" /></button>)}
                <button className="small-link" onClick={reset}>清除全部</button>
              </div>}
              {(git.error || connection?.sync?.error) && <p role="alert" className="error notice-bar">{git.error || connection?.sync?.error} <a href="#settings">查看 Git 设置</a></p>}
              {error && <div role="alert" className="error notice-bar">{error} <button className="button secondary" onClick={() => void load(null)}>重新读取账号</button></div>}
              <div className="ledger" aria-busy={loading}>
                <div className="ledger-head" aria-hidden="true">
                  <span className="ledger-col col-project">项目</span><span className="ledger-col col-marks">分类</span><span className="ledger-col col-language">语言</span><span className="ledger-col col-date">{ledgerLabel}</span>
                </div>
                <div className="ledger-body" ref={resultsPane}>
                  {loading && <div className="ledger-empty" role="status"><div className="skeleton-rows" aria-hidden="true"><span /><span /><span /><span /></div><p>正在读取本地收藏…</p></div>}
                  {!loading && data && (!data.repositories.length ? <div className="ledger-empty empty-state"><StarMark size={40} /><h2>{data.accountId ? '还没有同步的收藏' : '把好项目，放在一起。'}</h2><p>连接 GitHub 或 Gitee，收藏、分类和项目详情就会出现在这里。</p><button className="button" disabled={git.busy || syncRunning} onClick={() => { if (connection?.connected) void git.send({ type: 'GIT_SYNC', accountId: connection.account.accountId }); else location.hash = 'settings'; }}><WorkspaceIcon name="refresh" />{syncLabel}<WorkspaceIcon name="arrow" /></button></div>
                    : !results.length ? <div className="ledger-empty empty-state"><WorkspaceIcon name="search" /><h2>没有匹配的收藏</h2><p>换个关键词，或减少筛选条件。</p><button className="button secondary" onClick={reset}>清除全部筛选</button></div>
                      : results.slice((page - 1) * 40, page * 40).map(repo => {
                        const [owner, name] = repo.fullName.split('/');
                        const memberships = data.lists.filter(list => data.memberships.some(link => link.repositoryId === repo.id && link.listId === list.id));
                        const tags = data.tags.filter(tag => data.repositoryTags.some(link => link.repositoryId === repo.id && link.tagId === tag.id));
                        return <button id={'repository-' + repo.id} className={'ledger-row' + (dragging === repo.id ? ' dragging' : '')} key={repo.id} draggable
                          onDragStart={event => { event.dataTransfer.setData('text/plain', repo.id); event.dataTransfer.effectAllowed = 'move'; setDragging(repo.id); }}
                          onDragEnd={() => { setDragging(''); setDropTarget(''); }}
                          onClick={() => openDetail(repo)} aria-label={'查看项目详情：' + repo.fullName}>
                          <span className="seal" aria-hidden="true">{(name || owner || '').slice(0, 2)}</span>
                          <span className="project">
                            <span className="project-line"><span className="project-owner">{owner}/</span><span className="project-name">{name || owner}</span>{repo.visibility === 'private' && <span className="project-mark">私有</span>}{repo.archived && <span className="project-mark">已归档</span>}</span>
                            <span className="project-desc">{repo.description || '该项目暂无描述。'}</span>
                          </span>
                          <span className="col-marks project-marks">{memberships.slice(0, 2).map(list => <span className="mark" key={list.id}>{list.name}</span>)}{tags.slice(0, 2).map(tag => <span className="mark mark-local" key={tag.id}>{tag.name}</span>)}</span>
                          <span className="col-language project-language">{repo.language || '未标注语言'}</span>
                          <span className="col-date project-date num"><time>{formattedDate(filters.sort === 'updated' ? repo.pushedAt : repo.starredAt)}</time></span>
                        </button>;
                      }))}
                                  <footer className="library-footer"><span className="footer-note"><WorkspaceIcon name="lock" />本地收藏快照</span>{pages > 1 ? <nav className="pager" aria-label="收藏分页"><button className="icon-button pager-prev" aria-label="上一页" disabled={page === 1} onClick={() => setPage(value => value - 1)}><WorkspaceIcon name="chevron" /></button><span className="num" role="status">{page} / {pages}</span><button className="icon-button" aria-label="下一页" disabled={page === pages} onClick={() => setPage(value => value + 1)}><WorkspaceIcon name="chevron" /></button></nav> : <span className="footer-note num">{data?.repositories.length ?? 0} 个收藏</span>}</footer>
                </div>
              </div>

            </section>}
      </main>
    </div>
  </div>;
}