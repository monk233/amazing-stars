# Design: Amazing Stars

The locked system. Every Hallmark run reads this first and pages share it. Change it on purpose; the file is the rule.

## System

- Genre: modern-minimal
- Shape of the first page: app screen (收藏目录 + 设置页), no marketing sections
- Theme: Coral (dealt 3/3) — one print system, two stocks: folio (cotton, coral settled ink) and observatory (plotting paper, blue ink)
- Axes: light/grotesk-sans/warm · posture: restrained
- The product's own theme setting stays: `data-theme="folio|observatory"` × `data-mode="light|dark"`, four palettes, one structure.

## Tokens

`src/ui/tokens.css` is the source of truth. The roles:

```css
:root {
  --color-paper / -2 / -3   /* sheet, raised stock, sunken stock */
  --color-desk              /* the desk the sheet sits on, and the rail */
  --color-ink / -2 / muted  /* print ink, secondary ink, quiet labels */
  --color-rule / -2         /* hairline, stronger hairline */
  --color-accent / -soft    /* pressed settled ink: focus, active mark, saved state */
  --color-board / -board-type /* the one filled control (primary) and its reversed label */
  --color-error
  --font-body               /* Segoe UI + Chinese UI sans */
  --font-display            /* Fraunces (folio) / Space Grotesk (observatory): wordmark and Latin titles only */
  --radius-sheet / -control / -chip
  --shadow-sheet / -control / -pop / --backdrop
}
```

Spacing (4px scale), type steps, easings and durations are the scaffold's and live in the same file.

## Controls

- Primary: ink board, 1px pressed edge, 6px radius, 40px tall (44px hit target), sentence case, one per screen.
- Secondary: cotton card with the same pressed edge, same height, ink label.
- Fields: 40px, 1px muted border, focus ring in accent, never a border-width change.
- Tags and marks: 3px radius, 12px label, hairline or sunken stock.

## Motion

- Character: calm, state only. Hover tints, status changes; active presses 1px; focus appears at once. No reveals, no entrance choreography, no looping motion. Under reduced motion every transition collapses.

## Exports

`src/ui/tokens.css` in this project. Tailwind, DTCG or shadcn blocks are added here on request, per `export-formats.md`.
