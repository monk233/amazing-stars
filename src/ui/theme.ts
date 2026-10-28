import type { Appearance } from '../data/types';

export function resolveColorMode(mode: Appearance['mode'], systemDark: boolean): 'light' | 'dark' {
  return mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;
}

export function applyAppearance(appearance: Appearance): () => void {
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  // 首次应用不加过渡，避免首帧闪一下；之后主题或模式变化用一次 180ms 的颜色过渡收口。
  let first = true;
  const apply = () => {
    const root = document.documentElement;
    if (!first && !reduced.matches) {
      root.classList.add('theme-switching');
      window.setTimeout(() => root.classList.remove('theme-switching'), 240);
    }
    first = false;
    document.documentElement.dataset.theme = appearance.theme;
    document.documentElement.dataset.mode = resolveColorMode(appearance.mode, media.matches);
    document.documentElement.style.colorScheme = resolveColorMode(appearance.mode, media.matches);
  };
  apply();
  media.addEventListener('change', apply);
  return () => media.removeEventListener('change', apply);
}
