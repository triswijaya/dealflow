# Landing page design language

The landing page keeps its own composition (a left-aligned hero over a product window with a card floating off its edge, alternating feature rows, a dark bento for roles, centred closing statement) but speaks the app's visual language, so a visitor who signs up lands in a product that looks like the page they just read.

**Source of truth for values:** the app tokens in `src/app/inkwash.css` and the refined prototype they came from. The `--lp-*` tokens in `landing.css` copy those values; when the app palette changes, change them together.

## Colour

| Token | Value | App token | Use |
|---|---|---|---|
| `--lp-bg` | `#F7F8FA` | `--neutral-50` | Page canvas, nav, footer |
| `--lp-card` | `#FFFFFF` | `--surface-panel` | Cards, product window, floating card |
| `--lp-sunken` | `#EFF1F4` | `--neutral-75` | Tiles, nested panels, segmented controls |
| `--lp-line` | `#E6E8EC` | `--border-subtle` | 1px hairlines, outline button border |
| `--lp-ink` | `#14161B` | `--ink` | Headings, primary button, focus ring, active states |
| `--lp-body` | `#656B76` | `--text-secondary` | Secondary text (5:1 on the canvas) |
| `--lp-dim` | `#868C97` | `--neutral-500` | First half of two-tone headlines (large text only) |
| `--lp-dark` | `#1C1F25` | `--neutral-900` | Dark bento panels (roles, recommended plan, "after" slider) |
| `--lp-signal` | `#F2862B` | `--signal` | 6px attention dot in the ticker only |
| `--lp-green` | `#15A34A` | success glyph | Paid progress (invoice bar, donut) |

Status badges inside product mock-ups use the app's status washes: success green, warning orange, danger red, info teal, neutral grey.

**No blue, indigo or violet anywhere.** No scroll progress bar, no coloured background washes, no gradient text. The only decoration behind the hero window is a faint grey dot grid that fades out.

## Type

- **Geist** for all text, **Geist Mono** for figures (rupiah, counts, percentages, document numbers, revision tabs) and the `dealflow` wordmark, exactly as the app sets them. Both are loaded once in the root layout.
- Hero `h1`: `clamp(36px, 3.6vw, 52px)`, weight 600, line-height 1.04, tracking −0.04em, left-aligned.
- Section `h2`: `clamp(30px, 3.6vw, 52px)`, weight 600, line-height 1.08, tracking −0.04em.
- Two-tone headlines: first clause `--lp-dim`, second clause `--lp-ink`, on separate lines.
- Body 16–17px / 1.45 in `--lp-body`. Buttons 14.5–15px weight 500.

## Shape

| Element | Radius |
|---|---|
| Buttons, steps, segmented controls, menu toggle | `10px` (app control radius) |
| Badges, tags, small chips | `6px` (app badge) |
| Product window, floating card, plan cards, bento, slider | `20px` (app card) |
| Panes inside a card | `14px` |
| Rows, kanban cards | `10px` |

Elevation: hairline plus a long, soft, low-opacity cool shadow on the product window and the floating card only. Everything else is flat or hairline.

## Components

- **Brand:** the app's `BrandMark` (ink tile, three bars) plus the mono wordmark, from `src/components/brand.tsx`.
- **Nav:** 64px, brand left, grey links that turn ink on hover or when their section is in view, right side an outline "Masuk" and an ink "Buat ruang kerja".
- **Product mock-ups** (hero window, pipeline, quotation, invoice, roles) show the app's real vocabulary: stage names from `src/lib/labels.ts`, role access from `src/lib/auth-permissions.ts`, rupiah in mono.

## Do / don't

- Do keep hero copy left-aligned and closing copy centred.
- Do keep product copy in sync with the app when stages, roles or modules change.
- Don't introduce a new hue; reuse an app status colour if a mock-up needs meaning.
- Don't set display text above weight 600.
