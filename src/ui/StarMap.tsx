import { useMemo, useState } from 'react';
import type { List, Membership, Repository } from '../data/types';

export type StarMapProps = {
  repositories: Repository[];
  lists: List[];
  memberships: Membership[];
  onSelect: (repo: Repository) => void;
};

type Star = {
  repo: Repository;
  x: number;
  y: number;
  angle: number;
  delay: number;
  hue: number;
  fresh: number;
};

type Constellation = {
  id: string;
  name: string;
  centerX: number;
  centerY: number;
  radius: number;
  stars: Star[];
  labelY: number;
};

const WIDTH = 1200;
const HEIGHT = 260;
const GOLDEN = 2.399963229728653;

/** Deterministic background dust so the sky has depth without changing between renders. */
const DUST = Array.from({ length: 190 }, (_, index) => {
  const rand = (seed: number) => {
    const value = Math.sin(seed * 12.9898) * 43758.5453;
    return value - Math.floor(value);
  };
  return {
    x: rand(index + 1) * WIDTH,
    y: rand(index + 91) * HEIGHT,
    r: 0.4 + rand(index + 41) * 0.9,
    o: 0.08 + rand(index + 17) * 0.3,
  };
});

function hueOf(value: string) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) hash = (hash * 31 + value.charCodeAt(i)) % 360;
  return hash;
}

/**
 * The catalogue as a sky: one constellation per category, one star per record.
 * White stars, faint joins, category names set underneath — colour appears only when a
 * record is under the cursor, so the map stays a night sky instead of a scatter chart.
 */
export function StarMap({ repositories, lists, memberships, onSelect }: StarMapProps) {
  const [active, setActive] = useState<string | null>(null);

  const constellations = useMemo(() => {
    const byList = new Map<string, Repository[]>();
    const seen = new Set<string>();
    const repoById = new Map(repositories.map(repo => [repo.id, repo]));
    for (const link of memberships) {
      const repo = repoById.get(link.repositoryId);
      if (!repo) continue;
      seen.add(repo.id);
      byList.set(link.listId, [...(byList.get(link.listId) ?? []), repo]);
    }
    const groups: { id: string; name: string; repos: Repository[] }[] = [];
    for (const list of lists) {
      const repos = byList.get(list.id);
      if (repos?.length) groups.push({ id: list.id, name: list.name, repos });
    }
    const unlisted = repositories.filter(repo => !seen.has(repo.id));
    if (unlisted.length) groups.push({ id: '__unlisted', name: '未分类', repos: unlisted });

    const count = Math.max(groups.length, 1);
    const band = WIDTH - 150;
    const now = Date.now();
    return groups.map((group, groupIndex): Constellation => {
      const centerX = 75 + (band * (groupIndex + 0.5)) / count;
      const centerY = HEIGHT / 2 + Math.sin((groupIndex / count) * Math.PI * 2) * 34;
      const radius = Math.min(58 + group.repos.length * 3, 100);
      const stars = group.repos.map((repo, index): Star => {
        const angle = index * GOLDEN;
        const orbit = 20 + Math.sqrt(index + 1) * (radius / Math.sqrt(group.repos.length + 1));
        const starred = Date.parse(repo.starredAt);
        const age = Number.isNaN(starred) ? 400 : Math.max(0, (now - starred) / 86_400_000);
        return {
          repo,
          x: centerX + Math.cos(angle) * orbit,
          y: centerY + Math.sin(angle) * orbit * 0.7,
          angle,
          delay: groupIndex * 120 + index * 34,
          hue: hueOf(repo.language ?? '未标注'),
          fresh: Math.max(0.3, 1 - age / 720),
        };
      });
      // join the stars in polar order so each category reads as a figure, not a scribble
      stars.sort((a, b) => a.angle - b.angle);
      return { id: group.id, name: group.name, centerX, centerY, radius, stars, labelY: centerY + radius * 0.7 + 30 };
    });
  }, [repositories, lists, memberships]);

  const activeStar = constellations.flatMap(item => item.stars).find(star => star.repo.id === active);
  const total = repositories.length;

  return (
    <figure className="starmap" aria-label={`星图：${total} 个收藏，按 ${constellations.length} 个分类聚成星座`}>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
        <defs>
          <pattern id="starmap-grid" width="50" height="50" patternUnits="userSpaceOnUse">
            <path d="M50 0H0V50" fill="none" stroke="currentColor" strokeOpacity="0.06" strokeWidth="1" />
          </pattern>
          <radialGradient id="starmap-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.10" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width={WIDTH} height={HEIGHT} fill="url(#starmap-grid)" />
        <g className="starmap-rings">
          <circle cx={WIDTH / 2} cy={HEIGHT / 2} r={86} />
          <circle cx={WIDTH / 2} cy={HEIGHT / 2} r={148} />
          <circle cx={WIDTH / 2} cy={HEIGHT / 2} r={214} />
          <line x1={WIDTH / 2} y1="0" x2={WIDTH / 2} y2={HEIGHT} />
          <line x1="0" y1={HEIGHT / 2} x2={WIDTH} y2={HEIGHT / 2} />
          <line x1={WIDTH / 2 - 6} y1={HEIGHT / 2} x2={WIDTH / 2 + 6} y2={HEIGHT / 2} />
        </g>
        <ellipse cx={WIDTH / 2} cy={HEIGHT / 2} rx={WIDTH * 0.44} ry={HEIGHT * 0.52} fill="url(#starmap-glow)" />
        <g className="starmap-dust">
          {DUST.map((dust, index) => <circle key={index} cx={dust.x} cy={dust.y} r={dust.r} opacity={dust.o} />)}
        </g>

        {constellations.map(constellation => (
          <g key={constellation.id}>
            <line x1={constellation.centerX} y1={constellation.labelY - 14} x2={constellation.centerX}
              y2={constellation.centerY + constellation.radius * 0.6} className="starmap-leader" />
            {constellation.stars.map((star, index) => {
              const next = constellation.stars[index + 1];
              return next
                ? <line key={star.repo.id + '-join'} x1={star.x} y1={star.y} x2={next.x} y2={next.y} className="starmap-line" />
                : null;
            })}
            <text x={constellation.centerX} y={constellation.labelY} textAnchor="middle" className="starmap-label">
              {constellation.name} · {constellation.stars.length}
            </text>
          </g>
        ))}

        {constellations.flatMap(constellation => constellation.stars).map(star => {
          const isActive = star.repo.id === active;
          const radius = (2.6 + star.fresh * 2.4) * (isActive ? 1.8 : 1);
          return (
            <g key={star.repo.id} className="starmap-star" style={{ animationDelay: star.delay + 'ms' }}
              onClick={() => onSelect(star.repo)}
              onMouseEnter={() => setActive(star.repo.id)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(star.repo.id)}
              onBlur={() => setActive(null)}
              role="button" tabIndex={0} aria-label={`打开 ${star.repo.fullName}`}
              onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(star.repo); } }}>
              <circle cx={star.x} cy={star.y} r={radius * 4} className="starmap-hit" />
              <circle cx={star.x} cy={star.y} r={radius} className="starmap-dot"
                style={isActive ? { fill: `oklch(78% 0.15 ${star.hue})` } : undefined} />
              {star.repo.archived && <circle cx={star.x} cy={star.y} r={radius + 2.2} className="starmap-archived" />}
            </g>
          );
        })}

        {activeStar && (
          <g className="starmap-tip" pointerEvents="none">
            <text x={activeStar.x + 14} y={activeStar.y - 10} className="starmap-tip-name">{activeStar.repo.fullName}</text>
            <text x={activeStar.x + 14} y={activeStar.y + 5} className="starmap-tip-meta">
              {(activeStar.repo.language ?? '未标注') + ' · ' + (activeStar.repo.visibility === 'private' ? '私有' : '公开')}
            </text>
          </g>
        )}
      </svg>
      <figcaption className="starmap-caption">
        <span>星图 / {constellations.length} 星座 / {total} 颗星</span>
        <span aria-hidden="true">按分类聚类 · 点悬停显示语言</span>
      </figcaption>
    </figure>
  );
}

export default StarMap;
