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

## Styling layers

- `src/ui/tokens.css` is still the only palette. `src/ui/tailwind.css` (Tailwind v4) adds **utilities only** — preflight is deliberately not imported, and the project's hand-written reset in `base.css` stays authoritative.
- Tailwind utilities are in layers; unlayered project CSS wins over them. `@theme inline` bridges a subset of the Coral tokens so `bg-paper`, `text-ink-2`, `rounded-control` etc. resolve to the same variables, never to a second palette.
- Dark is driven by `<html data-mode="dark">`, not the OS preference: `@custom-variant dark` in `tailwind.css` maps `dark:` utilities onto that attribute.
- Rare UI components live in `src/ui/rare/` and keep their upstream props API, `data-slot` hooks and reduced-motion branches. Their hardcoded neutral "preview chrome" is confined to per-file constants; anything that touches the product surface must read a token.
- Attribution is a licence condition, not a courtesy: the copyright line stays in every adapted file, and the project credits Rare UI with a visible link (`README.md`, 第三方组件与许可).

## Controls

- Primary: ink board, 1px pressed edge, 6px radius, 40px tall (44px hit target), sentence case, one per screen.
- Secondary: cotton card with the same pressed edge, same height, ink label.
- Fields: 40px, 1px muted border, focus ring in accent, never a border-width change.
- Tags and marks: 3px radius, 12px label, hairline or sunken stock.

## Motion

Restrained but alive. Motion is a state or a gesture, never decoration: hover tint, 1px press, focus at once, a figure rolling to its new value. Loops are gone — the decorative orbs and the star field were removed in v3.1 because they read as decoration, not structure.

### Layout — v3.2, editorial catalogue with a star map

The v3 pass bolted effects onto a default dashboard shell (left rail + floating white card + centred hero), which is exactly the templated shape a redesign must avoid. v3.1 replaced the shell; v3.2 gave the product its own picture.

- **No rail.** A masthead runs edge to edge: wordmark, two text links (收藏 / 设置) with a coral rule under the current one, account and sync at the far right.
- **The page is the sheet.** The whole body is one full-bleed paper surface — no rounded card, no drop shadow, no frame around it.
- **Star map.** The catalogue opens with a dark observation window: one constellation per category, one white star per record, faint joins in polar order, concentric observation rings, background dust, and category names set beneath each figure. Hovering a star colours it with its language and shows `fullName · language · visibility`; clicking opens the record. This is the product's own image — do not replace it with cards or a heatmap.
- **Oversized head.** Kicker, display-face title at `clamp(2.2rem, 3.6vw, 3.2rem)`, figure flush right, one meta line, then a 3px language band.
- **Category index** is a horizontal row of plain text tabs: no boxes, no icons, count set small, coral rule under the current tab; drag-and-drop onto a tab still moves a record.
- **Ledger rows** are catalogue entries: 30px seal, display-face project name at 1.15rem, muted one-line description, hairline rules, right-aligned language and date. Hover is one 1px coral edge plus a seal tilt; rows cascade in once.
- **Chrome controls are pills** (ghost outline, like Cosmos Network); fields and rows stay square and ruled.
- Entry and settings views share the same page body. Entry keeps the entry aside (timeline / activity meter / same-category peers); settings keeps its numbered index and paper-2 section cards.
- Removed in v3.1: halo, pointer spotlight, star field, fluid orb, dot-matrix orb, rhythm heatmap, scroll-compacting hero, 300ms view slide.
- Kept: seal flight between row and entry page (unique `view-transition-name` per record), theme selector, animated figure, gravity letters in the first-run empty state, grid-reveal loading field.

### Visual references (v3.2)

- [Co-Star](https://dezzayn.com/apps/co-star) — NASA ephemeris data, black ground, one serif, huge negative space: data can be cold without gradients.
- [Cosmos Network (design-atlas teardown)](https://geoffreymanda.github.io/design-atlas/styles/cosmos-network.html) — near-black canvas, white type, concentric-circle diagram as the hero, ghost pill controls, flat elevation.
- [Are.na](https://pageproofer.com/inspiration/warm-editorial/arena/) — an archive product whose hierarchy comes from type and whitespace, not cards.
- [Cosmos.so](https://fudge.design/share/cosmos.so-design) — collection product: warm paper + black, oversized display type at 0.95 line height, colour only from content.

Adapted, not copied: the star map is a functional view of the user's own data, the palette is Coral, and the typefaces stay Fraunces / Space Grotesk.

### Rare UI allowance (v3.1)

| Component | Where |
| --- | --- |
| Animated Counter | the catalogue figure only; 0.35s, bounce 0, search debounced 180ms |
| Gravity Letters | first-run empty state (no account) only; user-triggered, Chinese single characters |
| Theme Selector | appearance page, theme axis only; previews read the four stocks |
| Grid Reveal | list loading (`loading && !data`) only |
| Fluid Orb / Matrix Orb | **not mounted** — adapted and kept in `src/ui/rare/` for future use; decoration is out of the v3.1 system |

Not allowed: cards and glow used as structure, side rails, decorative full-bleed layers, looping motion, scroll-driven parallax.

Folder grouping is the intended structural use: current-page grouping with sticky group heads, no transition on toggle.

## Exports

`src/ui/tokens.css` in this project. Tailwind, DTCG or shadcn blocks are added here on request, per `export-formats.md`.
