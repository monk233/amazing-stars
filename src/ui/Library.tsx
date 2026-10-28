import type { GitController } from './use-git';
import React, { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import type { Repository } from '../data/types';
import { accountProvider } from '../data/types';
import { filterRepositories, initialFilters, repositoryUrl, type Filters, type Library as LibraryData } from '../library/library';
import { request } from './client';
import { Brand, StarMark } from './Brand';
import { EntryAside } from './EntryAside';
import { InfoTip } from './InfoTip';
import { WorkspaceIcon } from './WorkspaceIcon';
import { SelectMenu } from './SelectMenu';
import { StarMap } from './StarMap';
import { AnimatedCounter } from './rare/animated-counter';
import GravityLetters from './rare/gravity-letters';
import GridReveal from './rare/grid-reveal';
import './library.css';

function formattedDate(value: string | null): string {
  if (!value || Number.isNaN(Date.parse(value))) return '暂无记录';
  return new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' }).format(new Date(value));
}

type ViewTransitionDocument = Document & { startViewTransition?: (callback: () => void) => unknown };
/** 列表 ↔ 详情用 View Transitions：印章从行里飞进详情页，不支持或偏好减少动效时瞬时切换。 */
function withViewTransition(update: () => void) {
  const doc = document as ViewTransitionDocument;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!doc.startViewTransition || reduced) { update(); return; }
  doc.startViewTransition(() => { flushSync(update); });
}
/** 语言色相：同名语言永远同一个 hue，跨页面一致。 */
function languageHue(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) % 360;
  return hash;
}
function ProjectDetail({ repo, data, onClose, onMove, onSelect }: {
  repo: Repository; data: LibraryData; onClose: () => void; onMove: (repositoryId: string, categoryId: string | null) => void; onSelect: (repo: Repository) => void;
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  const tags = data.tags.filter(tag => data.repositoryTags.some(link => link.repositoryId === repo.id && link.tagId === tag.id));
  const lists = data.lists.filter(list => data.memberships.some(link => link.repositoryId === repo.id && link.listId === list.id));
  const account = data.accounts.find(item => item.accountId === data.accountId);
  const url = repositoryUrl(repo.fullName, account ? accountProvider(account) : 'github');
  const [owner, name] = repo.fullName.split('/');
  return <section aria-labelledby="project-title" className="entry">
    <button className="back-link" type="button" onClick={onClose}><WorkspaceIcon name="chevron" />返回收藏</button>
    <header className="entry-head">
      <span className="entry-seal" aria-hidden="true" style={{ viewTransitionName: 'seal-' + repo.id }}>{(name || owner || '').slice(0, 2)}</span>
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
        <EntryAside repo={repo} data={data} onSelect={onSelect} />
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
  const [queryDraft, setQueryDraft] = useState(filters.query);
  // 首启空状态的撒字区：点过之后收起提示，只留落下的星星。
  const [gravityPlayed, setGravityPlayed] = useState(false);
  // 悬停分类时浮出该分类的前几项，点之前先看清。
  const [railPreview, setRailPreview] = useState<{ name: string; items: Repository[]; count: number; top: number; left: number } | null>(null);
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
  // 输入即时回显，查询推迟 180ms：中文输入法组合期和快速键入都不让计数每键滚动。
  useEffect(() => {
    if (queryDraft === filters.query) return;
    const timer = setTimeout(() => change({ query: queryDraft }), 180);
    return () => clearTimeout(timer);
  }, [queryDraft, filters.query]);
  // 外部改动查询（清除筛选、移除关键词 chip）时把草稿同步回去。
  useEffect(() => { setQueryDraft(filters.query); }, [filters.query]);
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
  // 语言分布条：hero 下方 4px 的分段色带，按收藏数比例，hue 与详情页一致。
  const languageBars = useMemo(() => {
    const counts = new Map<string, number>();
    for (const repo of data?.repositories ?? []) {
      const language = repo.language ?? '未标注';
      counts.set(language, (counts.get(language) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count, hue: languageHue(name) }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
      .slice(0, 6);
  }, [data]);
  const change = (patch: Partial<Filters>) => { setFilters(previous => ({ ...previous, ...patch })); setPage(1); };
  const reset = () => { setFilters(initialFilters); setPage(1); };
  const hasFilters = filters.query.trim() || filters.listId || filters.language || filters.visibility || filters.archived || filters.tagIds.length;
  const pages = Math.max(1, Math.ceil(results.length / 40));
  const currentPage = Math.min(page, pages);
  useEffect(() => { setPage(value => Math.min(value, pages)); }, [pages]);
  const goLibrary = (listId = filters.listId) => { setSelected(null); change({ listId }); location.hash = 'library'; };
  const closeDetail = () => {
    const id = selected?.id;
    withViewTransition(() => setSelected(null));
    // 印章飞回行之后再把焦点交给那一行，读屏顺序与视觉顺序一致。
    window.setTimeout(() => { if (id) document.getElementById('repository-' + id)?.focus(); }, 380);
  };
  const openDetail = (repo: Repository) => {
    savedScroll.current = resultsPane.current?.scrollTop ?? 0;
    withViewTransition(() => setSelected(repo));
  };
  const isDetail = route !== 'settings' && !!selected;
  const activeAccount = data?.accounts.find(item => item.accountId === data.accountId);
  const connection = git.state?.accounts.find(item => item.account.accountId === data?.accountId);
  const selectedCategory = data?.lists.find(list => list.id === filters.listId);
  const categoryName = filters.listId === '__unlisted' ? '未分类' : selectedCategory?.name ?? '所有收藏';
  const listOptions = [{ value: '', label: '所有收藏' }, ...(data?.lists.map(list => ({ value: list.id, label: list.name })) ?? []), { value: '__unlisted', label: '未分类' }];
  const extraCount = [filters.language, filters.visibility, filters.archived].filter(Boolean).length + filters.tagIds.length;
  const listCounts = new Map<string, Set<string>>();
  const repositoriesById = useMemo(() => new Map(data?.repositories.map(repo => [repo.id, repo]) ?? []), [data]);
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
  const ledgerLabel = filters.sort === 'updated' ? '推送时间' : '收藏时间';
  return <div className="app">
    <header className="masthead">
      <a href="#library" className="masthead-brand" onClick={() => goLibrary('')} aria-label="Amazing Stars 首页"><Brand /></a>
      <nav className="masthead-nav" aria-label="主导航">
        <a href="#library" className="masthead-link" aria-current={route === 'library' ? 'page' : undefined} onClick={() => goLibrary('')}>收藏</a>
        <a href="#settings" className="masthead-link" aria-current={route === 'settings' ? 'page' : undefined}>设置</a>
      </nav>
      <div className="masthead-side">
        {data?.accounts.length
          ? <SelectMenu label="本地账号" value={data.accountId ?? ''} options={data.accounts.map(item => ({ value: item.accountId, label: item.login }))} onChange={value => void load(value)} />
          : <span className="masthead-account">本地工作区</span>}
        <span className="masthead-status"><i className={connection?.connected ? 'connection-dot connected' : 'connection-dot'} />{activeAccount ? connection?.connected ? providerLabel + ' 已连接' : providerLabel + ' 本地快照' : '未连接 Git 账号'}</span>
        <button className="masthead-sync" disabled={loading || git.busy || syncRunning} onClick={() => {
          if (connection?.connected) void git.send({ type: 'GIT_SYNC', accountId: connection.account.accountId }); else location.hash = 'settings';
        }}><WorkspaceIcon name="refresh" />{syncLabel}</button>
      </div>
    </header>
    <main ref={main} className={'app-body' + (route === 'settings' || isDetail ? ' is-document' : '')}>
        {notice}
        {route === 'settings' ? <div className="document" key="settings">
          <header className="page-head">
            <div className="page-head-copy"><p className="eyebrow">SETTINGS · 本机</p><h1>设置与偏好</h1><p>管理外观、Git 连接、AI 服务与数据边界。</p></div>
            <a className="button secondary" href="#library">返回收藏</a>
          </header>
          <div className="settings-page">{children}</div>
        </div>
          : isDetail && selected && data ? <div className="document" key={'detail-' + selected.id}>
            <ProjectDetail repo={selected} data={data} onClose={closeDetail} onMove={moveTo}
              onSelect={next => {
                setSelected(next);
                requestAnimationFrame(() => main.current?.scrollTo({ top: 0 }));
              }} />
          </div>
            : <section className="library" key="library" aria-labelledby="library-title">
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
              </div>}
              <header className="catalogue-head">
                <div className="catalogue-title">
                  <p className="catalogue-kicker">{providerLabel} · 本地收藏目录</p>
                  <h1 id="library-title">{categoryName}</h1>
                  <p className="catalogue-meta">
                    <span>{activeAccount?.login ?? '本地工作区'}</span>
                    <span aria-hidden>·</span>
                    <span>{syncRunning ? '正在同步' : activeAccount?.lastSyncedAt ? '快照 ' + formattedDate(activeAccount.lastSyncedAt) : '尚未同步'}</span>
                    <span aria-hidden>·</span>
                    <span>{data?.lists.length ?? 0} 份分类</span>
                    <span aria-hidden>·</span>
                    <span>{languages.length} 种语言</span>
                  </p>
                  {selectedCategory?.description && <p className="catalogue-desc">{selectedCategory.description}</p>}
                </div>
                <div className="catalogue-figure">
                  {data && <AnimatedCounter className="catalogue-count" value={results.length} duration={0.35} separator="," />}
                  <span className="catalogue-unit">项</span>
                </div>
              </header>
              {data && languageBars.length > 0 && <div className="catalogue-langs" aria-hidden="true">
                {languageBars.map(bar => <span key={bar.name} title={bar.name + ' · ' + bar.count + ' 项'} style={{ flexGrow: bar.count, background: `oklch(62% 0.12 ${bar.hue})` }} />)}
              </div>}
              {data && data.repositories.length > 0 && <StarMap
                repositories={data.repositories}
                lists={data.lists}
                memberships={data.memberships}
                onSelect={repo => { setSelected(repo); requestAnimationFrame(() => main.current?.scrollTo({ top: 0 })); }}
              />}
              <nav className="category-bar" aria-label="按分类筛选">
                <button type="button" className="category-tab" aria-current={!filters.listId ? 'page' : undefined} onClick={() => goLibrary('')}>全部<span className="category-count num">{data?.repositories.length ?? 0}</span></button>
                {data?.lists.map(list => <button key={list.id} type="button"
                  className={'category-tab' + (dropTarget === list.id ? ' drop-target' : '')}
                  {...dropProps(list.id, list.id)}
                  aria-current={filters.listId === list.id ? 'page' : undefined}
                  onMouseEnter={event => {
                    const items = data.memberships.filter(link => link.listId === list.id)
                      .map(link => repositoriesById.get(link.repositoryId))
                      .filter((repo): repo is Repository => repo !== undefined);
                    const rect = event.currentTarget.getBoundingClientRect();
                    setRailPreview({ name: list.name, items: items.slice(0, 4), count: items.length, top: rect.bottom + 10, left: rect.left });
                  }}
                  onMouseLeave={() => setRailPreview(null)}
                  onClick={() => goLibrary(list.id)}>{list.name}<span className="category-count num">{listCounts.get(list.id)?.size ?? 0}</span></button>)}
                <button type="button" className="category-tab" aria-current={filters.listId === '__unlisted' ? 'page' : undefined} onClick={() => goLibrary('__unlisted')}>未分类<span className="category-count num">{unlistedCount}</span></button>
                {selectedCategory && <button type="button" className="category-edit" onClick={() => { setConfirming(''); setEditor({ id: selectedCategory.id, name: selectedCategory.name, description: selectedCategory.description ?? '' }); }}><WorkspaceIcon name="edit" />编辑分类</button>}
                <button type="button" className="category-add" aria-label="新建分类" title="新建分类" disabled={!data?.accountId}
                  onClick={() => { setConfirming(''); setEditor({ id: null, name: '', description: '' }); }}><WorkspaceIcon name="plus" /></button>
              </nav>
              <div className="toolbar">
                <label className="search"><WorkspaceIcon name="search" /><input ref={searchInput} aria-label="搜索收藏" type="search" placeholder="搜索项目、描述或标签…" value={queryDraft} disabled={!data?.repositories.length} onChange={event => setQueryDraft(event.target.value)} /><kbd>Ctrl K</kbd></label>
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
              {error && data && <p role="alert" className="error notice-bar">读取失败，正在展示上次快照。<button type="button" className="small-link" onClick={() => void load(data.accountId)}>重试</button></p>}
              <div className="ledger" aria-busy={loading}>
                <div className="ledger-head" aria-hidden="true">
                  <span className="ledger-col col-project">项目</span><span className="ledger-col col-marks">分类</span><span className="ledger-col col-language">语言</span><span className="ledger-col col-date">{ledgerLabel}</span>
                </div>
                <div className="ledger-body" ref={resultsPane}>
                  {!loading && error && !data && <div className="ledger-empty empty-state" role="alert"><h2>收藏没有读取成功</h2><p>{error}</p><button className="button secondary" onClick={() => void load(null)}>重新读取账号</button></div>}
                  {loading && !data && <div className="ledger-empty" role="status">
                    <GridReveal aspect={16 / 9} className="ledger-reveal" aria-hidden />
                    <p>正在读取本地收藏…</p>
                  </div>}
                  {!loading && data && (!data.repositories.length ? <div className="ledger-empty empty-state">
                    {data.accountId
                      ? <StarMark size={40} />
                      : <GravityLetters className="rare-gravity" type="letters" items={['收', '藏', '星', '档', '书', '签']} size={24} gravity={900} maxGlyphs={16} deviceTilt={false} color="var(--color-rule-2)" onPointerDown={() => setGravityPlayed(true)}>
                        {!gravityPlayed && <span className="rare-gravity-hint">点这个区域，让收藏的星星落下来</span>}
                      </GravityLetters>}
                    <h2>{data.accountId ? '还没有同步的收藏' : '把好项目，放在一起。'}</h2><p>连接 GitHub 或 Gitee，收藏、分类和项目详情就会出现在这里。</p><button className="button secondary" disabled={git.busy || syncRunning} onClick={() => { if (connection?.connected) void git.send({ type: 'GIT_SYNC', accountId: connection.account.accountId }); else location.hash = 'settings'; }}><WorkspaceIcon name="refresh" />{syncLabel}</button></div>
                    : !results.length ? <div className="ledger-empty empty-state"><WorkspaceIcon name="search" /><h2>没有匹配的收藏</h2><p>换个关键词，或减少筛选条件。</p><button className="button secondary" onClick={reset}>清除全部筛选</button></div>
                      : results.slice((currentPage - 1) * 40, currentPage * 40).map((repo, rowIndex) => {
                        const [owner, name] = repo.fullName.split('/');
                        const memberships = data.lists.filter(list => data.memberships.some(link => link.repositoryId === repo.id && link.listId === list.id));
                        const tags = data.tags.filter(tag => data.repositoryTags.some(link => link.repositoryId === repo.id && link.tagId === tag.id));
                        return <button id={'repository-' + repo.id} className={'ledger-row' + (dragging === repo.id ? ' dragging' : '')} key={repo.id} draggable style={{ '--row-i': Math.min(rowIndex, 18) } as CSSProperties}
                          onDragStart={event => { event.dataTransfer.setData('text/plain', repo.id); event.dataTransfer.effectAllowed = 'move'; setDragging(repo.id); }}
                          onDragEnd={() => { setDragging(''); setDropTarget(''); }}
                          onClick={() => openDetail(repo)} aria-label={'查看项目详情：' + repo.fullName}>
                          <span className="seal" aria-hidden="true" style={{ viewTransitionName: 'seal-' + repo.id }}>{(name || owner || '').slice(0, 2)}</span>
                          <span className="project">
                            <span className="project-line"><span className="project-owner">{owner}/</span><span className="project-name">{name || owner}</span>{repo.visibility === 'private' && <span className="project-mark">私有</span>}{repo.archived && <span className="project-mark">已归档</span>}</span>
                            <span className="project-desc">{repo.description || '该项目暂无描述。'}</span>
                          </span>
                          <span className="col-marks project-marks">{memberships.slice(0, 2).map(list => <span className="mark" key={list.id}>{list.name}</span>)}{tags.slice(0, 2).map(tag => <span className="mark mark-local" key={tag.id}>{tag.name}</span>)}</span>
                          <span className="col-language project-language">{repo.language || '未标注语言'}</span>
                          <span className="col-date project-date num"><time>{formattedDate(filters.sort === 'updated' ? repo.pushedAt : repo.starredAt)}</time><span className="row-cue" aria-hidden="true"><WorkspaceIcon name="chevron" /></span></span>
                        </button>;
                      }))}
                                  <footer className="library-footer"><span className="footer-note"><WorkspaceIcon name="lock" />本地收藏快照</span>{pages > 1 ? <nav className="pager" aria-label="收藏分页"><button className="icon-button pager-prev" aria-label="上一页" disabled={currentPage === 1} onClick={() => setPage(value => value - 1)}><WorkspaceIcon name="chevron" /></button><span className="num" role="status">{currentPage} / {pages}</span><button className="icon-button" aria-label="下一页" disabled={currentPage === pages} onClick={() => setPage(value => value + 1)}><WorkspaceIcon name="chevron" /></button></nav> : <span className="footer-note num">{data?.repositories.length ?? 0} 个收藏</span>}</footer>
                </div>
              </div>

            </section>}
    </main>
    {railPreview && <div className="rail-preview" aria-hidden="true" style={{ top: railPreview.top, left: railPreview.left }}>
      <p className="rail-preview-name">{railPreview.name}</p>
      {railPreview.items.length
        ? <ul className="rail-preview-list">
          {railPreview.items.map(repo => <li key={repo.id}>
            <span className="rail-preview-repo">{repo.fullName}</span>
            <span className="rail-preview-lang">{repo.language ?? '未标注'}</span>
          </li>)}
        </ul>
        : <p className="rail-preview-empty">这个分类还是空的</p>}
      <p className="rail-preview-count">{railPreview.count > 4 ? '另有 ' + (railPreview.count - 4) + ' 项' : railPreview.count + ' 项'}</p>
    </div>}
  </div>;
}