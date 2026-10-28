import { useEffect, useRef } from 'react';
import './star-field.css';

export type StarFieldProps = {
  density?: number;
  className?: string;
};

const DEFAULT_DENSITY = 240;
const MAX_DENSITY = 2000;
const DPR_CAP = 2;
const ACCENT_SHARE = 0.45;
const MAX_DRIFT = 0.06;
const PARALLAX = 6;
const PARALLAX_LERP = 0.05;
const MIN_RADIUS = 0.8;
const MAX_RADIUS = 2.2;
const MIN_ALPHA = 0.2;
const MAX_ALPHA = 0.72;
const TAU = Math.PI * 2;

type Star = {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  vx: number;
  vy: number;
};

type Palette = { ink: string; accent: string };

function clampDensity(value: number) {
  return Number.isFinite(value) ? Math.min(MAX_DENSITY, Math.max(0, Math.floor(value))) : DEFAULT_DENSITY;
}

function createStars(count: number) {
  const ink: Star[] = [];
  const accent: Star[] = [];
  for (let index = 0; index < count; index += 1) {
    const angle = Math.random() * TAU;
    const speed = Math.random() * MAX_DRIFT;
    const star: Star = {
      x: Math.random(),
      y: Math.random(),
      radius: MIN_RADIUS + Math.random() * (MAX_RADIUS - MIN_RADIUS),
      alpha: MIN_ALPHA + Math.random() * (MAX_ALPHA - MIN_ALPHA),
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed * 0.6,
    };
    (Math.random() < ACCENT_SHARE ? accent : ink).push(star);
  }
  return { ink, accent };
}

// Canvas cannot resolve var() and the Coral tokens are oklch(), so sample a 1×1 pixel.
function sampleColor(value: string, fallback: string) {
  const probe = document.createElement('canvas');
  probe.width = 1;
  probe.height = 1;
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  if (!ctx) return fallback;
  ctx.fillStyle = fallback;
  // an invalid value leaves the fallback fillStyle in place
  ctx.fillStyle = value;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillRect(0, 0, 1, 1);
  const data = ctx.getImageData(0, 0, 1, 1).data;
  return `rgb(${data[0] ?? 0}, ${data[1] ?? 0}, ${data[2] ?? 0})`;
}

function readPalette(): Palette {
  const styles = getComputedStyle(document.documentElement);
  const ink = sampleColor(styles.getPropertyValue('--color-ink').trim(), 'rgb(0, 0, 0)');
  const accent = sampleColor(styles.getPropertyValue('--color-accent').trim(), ink);
  return { ink, accent };
}

export function StarField({ density = DEFAULT_DENSITY, className }: StarFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const stars = createStars(clampDensity(density));
    const reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    let reduced = reducedQuery.matches;
    let palette = readPalette();
    let width = 1;
    let height = 1;
    let scale = 1;
    let offsetX = 0;
    let offsetY = 0;
    let targetX = 0;
    let targetY = 0;
    let raf = 0;
    let last = 0;
    let visible = document.visibilityState !== 'hidden';

    const sizeCanvas = () => {
      const rect = canvas.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.round(rect.width));
      const nextHeight = Math.max(1, Math.round(rect.height));
      const nextScale = Math.min(window.devicePixelRatio || 1, DPR_CAP);
      if (nextWidth === width && nextHeight === height && nextScale === scale) return false;
      width = nextWidth;
      height = nextHeight;
      scale = nextScale;
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      return true;
    };

    const paint = (dt: number) => {
      const step = dt > 0 ? Math.min(dt, 64) / (1000 / 60) : 0;
      const ease = step > 0 ? 1 - Math.pow(1 - PARALLAX_LERP, step) : 0;
      offsetX += (targetX - offsetX) * ease;
      offsetY += (targetY - offsetY) * ease;

      ctx.clearRect(0, 0, width, height);

      const drawPass = (group: Star[], color: string) => {
        ctx.fillStyle = color;
        for (const star of group) {
          if (step > 0) {
            star.x = (star.x + (star.vx * step) / width + 1) % 1;
            star.y = (star.y + (star.vy * step) / height + 1) % 1;
          }
          ctx.globalAlpha = star.alpha;
          ctx.beginPath();
          ctx.arc(star.x * width + offsetX, star.y * height + offsetY, star.radius, 0, TAU);
          ctx.fill();
        }
      };

      drawPass(stars.ink, palette.ink);
      drawPass(stars.accent, palette.accent);
      ctx.globalAlpha = 1;
    };

    const frame = (now: number) => {
      const dt = last ? now - last : 1000 / 60;
      last = now;
      paint(dt);
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      if (raf || reduced || !visible) return;
      last = 0;
      raf = requestAnimationFrame(frame);
    };

    const stop = () => {
      if (!raf) return;
      cancelAnimationFrame(raf);
      raf = 0;
    };

    const resize = () => {
      if (sizeCanvas()) paint(0);
    };

    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(resize) : null;
    resizeObserver?.observe(canvas);

    const themeObserver = new MutationObserver(() => {
      palette = readPalette();
      if (reduced) paint(0);
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'data-mode'] });

    const onPointerMove = (event: MouseEvent) => {
      if (!width || !height) return;
      targetX = Math.max(-1, Math.min(1, (event.clientX / width - 0.5) * 2)) * PARALLAX;
      targetY = Math.max(-1, Math.min(1, (event.clientY / height - 0.5) * 2)) * PARALLAX;
    };
    window.addEventListener('mousemove', onPointerMove, { passive: true });

    const onVisibilityChange = () => {
      visible = document.visibilityState !== 'hidden';
      if (visible) start();
      else stop();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const onReducedChange = (event: MediaQueryListEvent) => {
      reduced = event.matches;
      if (reduced) {
        stop();
        paint(0);
      } else {
        start();
      }
    };
    reducedQuery.addEventListener('change', onReducedChange);

    // Zoom changes devicePixelRatio: rebuild the buffer and re-arm the query for the new ratio.
    let dprQuery: MediaQueryList | null = null;
    function syncDpr() {
      if (sizeCanvas()) paint(0);
      dprQuery?.removeEventListener('change', syncDpr);
      dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`);
      dprQuery.addEventListener('change', syncDpr);
    }
    syncDpr();

    start();

    return () => {
      stop();
      resizeObserver?.disconnect();
      themeObserver.disconnect();
      window.removeEventListener('mousemove', onPointerMove);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      reducedQuery.removeEventListener('change', onReducedChange);
      dprQuery?.removeEventListener('change', syncDpr);
    };
  }, [density]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-slot="star-field"
      className={className ? `star-field ${className}` : 'star-field'}
    />
  );
}

export default StarField;
