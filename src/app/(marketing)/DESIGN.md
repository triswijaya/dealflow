# Landing page design language

Reference: devin.ai. Soft paper canvas, near-black type with grey secondary text, pill-shaped controls, generously rounded panels, and a product window with a card floating over its edge.

**Provenance.** Written from three screenshots of the live site (home hero, home closing section with footer, `/security` hero), measured at 1506 CSS px wide, plus an earlier token reference. Sections between the hero and the closing block were not observed; they are adapted to the same rules, not copied.

## Colour

| Token | Value | Use |
|---|---|---|
| `--lp-bg` | `#f8f8f8` | Page canvas, nav, footer |
| `--lp-card` | `#ffffff` | Cards, product window, floating card |
| `--lp-sunken` | `#f1f1f1` | Tags, nested panels, logo tiles, hover rows |
| `--lp-line` | `#e5e5e5` | 1px hairlines, secondary button border |
| `--lp-ink` | `#141414` | Headings, primary button fill, active states |
| `--lp-body` | `#6b6b6b` | Secondary text (the site uses `#7d7d7d`; darkened to pass 4.5:1) |
| `--lp-dim` | `#8a8a8a` | First half of two-tone headlines (large text only, 3.3:1) |
| `--lp-dark` | `#1f1f1f` | Dark bento panels (team, recommended plan) |
| `--lp-dot` | `#367df7` | Unread / current dots, "info" status |
| `--lp-blue` | `#2200ff` | Focus ring and scroll progress only |
| green `#1f9d57`, red `#d6453d` | | Product-mock semantics only (paid, overdue) |

No other hues. Backgrounds behind the hero window carry very pale blurred washes, as on the reference.

## Type

- **Marketing text:** Hanken Grotesk, the closest free match to the reference face (slanted-cut `t`, straight `y`, neutral grotesque, plain zeros). Weights 400 and 500 only.
- **Product mock UI:** Inter, as in the reference's app window.
- No monospace anywhere.
- Hero `h1`: `clamp(34px, 3.2vw, 48px)`, weight 500, line-height 1.04, tracking −0.035em, left-aligned.
- Section `h2`: `clamp(32px, 3.8vw, 56px)`, weight 500, line-height 1.1, tracking −0.035em.
- Two-tone headlines: first clause `--lp-dim`, second clause `--lp-ink`, on separate lines.
- Body 16–17px / 1.45 in `--lp-body`. Nav and buttons 15–16px weight 400.

## Shape

Everything is round.

| Element | Radius |
|---|---|
| Buttons, tabs, tags, badges, inputs, status pills | `999px` |
| Product window, floating card, plan cards, bento | `20–24px` |
| Panes inside a card | `14–16px` |
| Rows, list items | `10–12px` |

Elevation: hairline plus a long, soft, low-opacity shadow on the product window and the floating card only. Everything else is flat.

## Components

- **Nav:** 64px, logo glyph + wordmark left, links left-aligned after it, right side a pill pair: outlined "Masuk" and black "Buat ruang kerja".
- **Primary button:** `--lp-ink` pill, white text, 44px tall in content (34px in nav).
- **Secondary button:** transparent pill, 1px `--lp-line`, ink text; white fill on hover.
- **Product window:** white, 16px radius, traffic-light dots, a left sidebar of rows (the story steps) and a main thread. A white 20px-radius card overlaps its bottom-right edge and runs past it.
- **Ticker row:** hairline above, small blue square + uppercase label + one line of text, right-aligned link with an arrow.
- **Closing section:** centred two-tone headline, centred pill pair, hairline, footer with a large grey logo left and link columns right (headings ink, links grey).

## Do / don't

- Do keep controls pill-shaped and panels generously rounded.
- Do keep hero copy left-aligned and closing copy centred.
- Don't use square-cornered buttons, heavy shadows, gradients on text, or blue in headlines.
- Don't set display text above weight 500.
