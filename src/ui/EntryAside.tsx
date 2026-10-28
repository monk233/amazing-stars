import type { CSSProperties } from 'react';
import type { Repository } from '../data/types';
import type { Library as LibraryData } from '../library/library';
import './entry-aside.css';

export type EntryAsideProps = {
  repo: Repository;
  data: LibraryData;
  onSelect: (repo: Repository) => void;
};

const DATE_FORMAT = new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium' });
const DAY_MS = 86_400_000;
const METER_SEGMENTS = 8;
// the newest push lights all eight; each threshold crossed dims one segment
const SEGMENT_LIMITS = [3, 7, 14, 30, 90, 180, 365] as const;

function formattedDate(value: string | null): string {
  if (!value) return '暂无记录';
  const time = Date.parse(value);
  return Number.isNaN(time) ? '暂无记录' : DATE_FORMAT.format(new Date(time));
}

function daysSince(value: string | null): number | null {
  if (!value) return null;
  const time = Date.parse(value);
  if (Number.isNaN(time)) return null;
  return Math.max(0, Math.floor((Date.now() - time) / DAY_MS));
}

function activitySegments(days: number | null): number {
  if (days === null) return 0;
  const index = SEGMENT_LIMITS.findIndex(limit => days <= limit);
  return index === -1 ? 1 : METER_SEGMENTS - index;
}

function hueOf(language: string): number {
  let hash = 0;
  for (const char of language) hash = (hash * 31 + (char.codePointAt(0) ?? 0)) % 360;
  return hash;
}

function activityLabel(repo: Repository): { value: string; note: string } {
  const pushedDays = daysSince(repo.pushedAt);
  if (repo.archived) return { value: '已归档', note: '归档后不再推送，刻度停在最后一次快照' };
  if (pushedDays === null) return { value: '暂无推送', note: '没有可用的最近推送时间' };
  const value = pushedDays === 0 ? '今天推送' : `${pushedDays} 天前`;
  return { value, note: `最近推送于 ${formattedDate(repo.pushedAt)}` };
}

function sameCategory(repo: Repository, data: LibraryData) {
  const listIds = new Set(data.memberships.filter(link => link.repositoryId === repo.id).map(link => link.listId));
  const owned = data.lists.filter(list => listIds.has(list.id));
  const shared = owned.find(list => data.memberships.some(link => link.listId === list.id && link.repositoryId !== repo.id));
  const list = shared ?? owned[0] ?? null;
  if (!list) return { list: null, peers: [] as Repository[], count: 0 };

  const ids = new Set(data.memberships.filter(link => link.listId === list.id).map(link => link.repositoryId));
  const peers = data.repositories
    .filter(item => ids.has(item.id) && item.id !== repo.id)
    .sort((a, b) => a.fullName.localeCompare(b.fullName))
    .slice(0, 4);
  return { list, peers, count: ids.size };
}

export function EntryAside({ repo, data, onSelect }: EntryAsideProps) {
  const starredDays = daysSince(repo.starredAt);
  const pushedDays = daysSince(repo.pushedAt);
  const segments = activitySegments(pushedDays);
  const activity = activityLabel(repo);
  const category = sameCategory(repo, data);

  const timeline = [
    { key: 'starred', label: '收藏', date: formattedDate(repo.starredAt) },
    { key: 'pushed', label: '最近推送', date: formattedDate(repo.pushedAt) },
    { key: 'fetched', label: '本地快照', date: formattedDate(repo.fetchedAt) },
  ];

  return (
    <section className="aside-root" data-slot="entry-aside" aria-label="项目脉络">
      <dl className="aside-stats">
        <div>
          <dt>分类项目</dt>
          <dd>
            {category.list ? category.count : '—'}
            {category.list ? <span className="aside-unit">项</span> : null}
          </dd>
        </div>
        <div>
          <dt>收藏已</dt>
          <dd>
            {starredDays === null ? '—' : starredDays}
            {starredDays === null ? null : <span className="aside-unit">天</span>}
          </dd>
        </div>
      </dl>

      <section className="aside-block" aria-labelledby="aside-timeline-title">
        <h3 className="aside-title" id="aside-timeline-title">收藏轨迹</h3>
        <ol className="aside-timeline">
          {timeline.map(node => (
            <li
              key={node.key}
              className="aside-timeline-node"
              data-kind={node.key}
              data-missing={node.date === '暂无记录' ? 'true' : 'false'}
            >
              <span className="aside-timeline-dot" aria-hidden="true" />
              <span className="aside-timeline-label">{node.label}</span>
              <span className="aside-timeline-date">{node.date}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="aside-block" aria-labelledby="aside-activity-title">
        <h3 className="aside-title" id="aside-activity-title">活跃度</h3>
        <p className="aside-activity-value" data-archived={repo.archived ? 'true' : 'false'}>{activity.value}</p>
        <div className="aside-meter" data-state={repo.archived ? 'archived' : 'active'} aria-hidden="true">
          {Array.from({ length: METER_SEGMENTS }, (_, index) => (
            <span key={index} className="aside-meter-seg" data-on={index < segments ? 'true' : 'false'} />
          ))}
        </div>
        <p className="aside-activity-note">{activity.note}</p>
      </section>

      <section className="aside-block" aria-labelledby="aside-peers-title">
        <div className="aside-head">
          <h3 className="aside-title" id="aside-peers-title">同一分类</h3>
          {category.list ? <span className="aside-tag" title={category.list.name}>{category.list.name}</span> : null}
        </div>
        {category.list ? (
          category.peers.length ? (
            <ul className="aside-peers" aria-label={`「${category.list.name}」中的其他收藏`}>
              {category.peers.map(peer => (
                <li key={peer.id}>
                  <button
                    type="button"
                    className="aside-peer"
                    onClick={() => onSelect(peer)}
                    aria-label={`查看 ${peer.fullName} 的详情`}
                  >
                    <span
                      className="aside-peer-dot"
                      aria-hidden="true"
                      data-missing={peer.language ? 'false' : 'true'}
                      style={peer.language ? ({ '--aside-hue': hueOf(peer.language) } as CSSProperties) : undefined}
                    />
                    <span className="aside-peer-name">{peer.fullName}</span>
                    <span className="aside-peer-lang">{peer.language ?? '未标注'}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="aside-empty">这个分类里只有它。</p>
          )
        ) : (
          <p className="aside-empty">还没有归入分类。</p>
        )}
      </section>
    </section>
  );
}

export default EntryAside;
