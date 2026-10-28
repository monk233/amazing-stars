// Adapted from Rare UI (rareui.com) — MIT + Commons Clause + Attribution. Copyright (c) 2026 Swami Malode.
//
// Shared colour bridge for the canvas-based Rare UI components: 2D canvases and WebGL
// uniforms cannot resolve CSS custom properties, and the Coral palette ships oklch()
// tokens, so colours are sampled through a 1×1 context instead of hard-coding a second
// palette in TypeScript.

/** Theme attributes the canvas components watch to re-resolve token colours. */
export function themeKey() {
  if (typeof document === 'undefined') return ''
  const { dataset } = document.documentElement
  return `${dataset.theme ?? ''}|${dataset.mode ?? ''}`
}

/**
 * Resolve a `color` prop to a CSS colour string.
 * An empty value falls back to the Coral accent token, `var(--x)` is unwrapped, and the
 * element's computed text colour is the last resort (e.g. reduced-motion browsers).
 */
export function resolveColor(el: Element, color?: string) {
  const styles = getComputedStyle(el)
  const value = (color ?? '').trim()
  if (!value) return styles.getPropertyValue('--color-accent').trim() || styles.color
  if (value.startsWith('var(')) {
    const name = value.slice(4, -1).trim()
    return styles.getPropertyValue(name).trim() || styles.color
  }
  return value
}

/**
 * Normalise any CSS colour (hex, rgb, oklch, ...) to 0–255 sRGB bytes.
 * An unsupported value keeps the fallback fill, so the canvas never turns black by accident.
 */
export function toRgbBytes(
  color: string,
  fallback: [number, number, number] = [0, 0, 0],
): [number, number, number] {
  const probe = document.createElement('canvas')
  probe.width = 1
  probe.height = 1
  const ctx = probe.getContext('2d', { willReadFrequently: true })
  if (!ctx) return fallback
  ctx.fillStyle = `rgb(${fallback[0]}, ${fallback[1]}, ${fallback[2]})`
  // an invalid value leaves the fallback fillStyle in place
  ctx.fillStyle = color
  ctx.clearRect(0, 0, 1, 1)
  ctx.fillRect(0, 0, 1, 1)
  const data = ctx.getImageData(0, 0, 1, 1).data
  return [data[0] ?? 0, data[1] ?? 0, data[2] ?? 0]
}

/** Resolve a colour prop (or the accent token) to an `rgb()` string for 2D canvas. */
export function resolveCanvasColor(el: Element, color?: string) {
  const [r, g, b] = toRgbBytes(resolveColor(el, color))
  return `rgb(${r}, ${g}, ${b})`
}

/** Resolve a colour prop (or the accent token) to WebGL's 0–1 RGB triple. */
export function resolveWebglColor(el: Element, color?: string): [number, number, number] {
  const [r, g, b] = toRgbBytes(resolveColor(el, color))
  return [r / 255, g / 255, b / 255]
}
