# DESIGN.md — Inkwash Design System

> **DealFlow v2 overrides (2026-10-31).** The app keeps the Inkwash structure and class names, but its tokens now follow the final prototype (`Prototype/dealflow-v2.html`): Plus Jakarta Sans for text and numbers, cool greys (`#F4F5F7` work area, `#FBFBFC` sidebar, `#14161B` ink), a light sidebar beside a grey work area with content on white cards instead of one inset white panel, rounded-rectangle buttons, and SaaS density (240px sidebar, 24px titles, 14px body, 32/36px controls, content capped at 1400px). Breakpoints: full sidebar from 960px, icon rail 768–959px, phone below 768px. Where this document and `src/app/inkwash.css` disagree, the CSS wins.

**Version** 1.0 · **Theme** Light (dark theme provisional, §3.10) · **Scope** Any SaaS product: dashboards, admin panels, CRMs, trackers, AI apps, data-heavy tools.

**Source** Eight reference screenshots of one product family (a school-management dashboard): four screens — *Attendance*, *Student overview*, *Exams*, *Schedule* — each shown once zoomed-in and once full-frame. All values below were reverse-engineered from those screenshots.

> **Inkwash** = a white, hairline-divided work surface inset into a softly tinted shell; monochrome *ink* (black) for every primary and selected state; pastel *washes* for status and category; medium-weight grotesk type at small sizes; everything rounded, nothing loud.

---

## 0. How to use this document

**Authority.** This file is the primary design authority. When a product spec conflicts with it, keep the *Core identity* (§2.5) and adapt only *Reusable patterns* and *Product-specific decisions*.

**Confidence markers** used throughout:

| Marker | Meaning |
|---|---|
| **[O]** | Observed directly and consistently across references. Treat as law. |
| **[M]** | Measured from compressed phone screenshots. Sizes ±2px, colors ±3% lightness. Values are reasoned approximations, rounded onto the system grid. |
| **[S]** | System decision: standardized, extrapolated, or adjusted (for consistency or accessibility) where references were silent, inconsistent, or non-compliant. |

**Build order for an AI agent.** 1) Paste the token file (§15.1). 2) Build the shell (§8.1–8.3). 3) Build page header + regions (§8.5–8.6). 4) Compose components (§9) using only tokens. 5) Run the checklist (§16).

**Ten golden rules (memorize these):**

1. The app is a **white panel inset 12px into a tinted gray shell**. The sidebar lives on the shell, not on a separate surface.
2. **Black is the only brand accent.** Primary buttons, selected chips, selected dates, count badges, tooltips, "now" markers — all ink.
3. **Selection inversion:** on gray/tinted surfaces, *selected = white pill*; on white surfaces, *selected = black pill*. Large-area selections (rows, cards) use a muted fill or an ink ring instead (§10.2).
4. **Color means status or category, never decoration.** It appears as pale washes (backgrounds) plus small saturated glyphs — never as large saturated fills.
5. **Actions and filters are pills. Containers are rounded rectangles. Dates, avatars and icon chips are circles.**
6. **Regions are separated by full-bleed hairlines, not by boxes.** Cards are reserved for metrics and records.
7. **Type is medium (500) or regular (400). Never bold 700.** Page titles max out at 24px. Sentence case everywhere.
8. Default control height is **32px**; default body text is **13–14px**.
9. Shadows are almost absent: only small white chips floating on washes, and overlays.
10. Exactly **two gradients** exist: the shell tint and chart area fills.

---

## 1. Design philosophy and visual identity

### 1.1 Personality

Calm, orderly, friendly-precise. It reads like well-organized stationery: white paper, pastel sticky tabs, a black pen for what matters. It is quiet by default and becomes assertive only through black — so the eye always lands on the selected date, the active filter, the primary action, or the current time.

### 1.2 Balance of density and whitespace [O]

- Information is **moderately dense inside components** (13px text, 32px rows, 8px gaps) but **generously spaced between regions** (24px insets, hairline separators, empty gutters).
- Whitespace is used as the main separator inside regions; hairlines separate regions; cards separate only self-contained objects.
- Nothing is crammed edge-to-edge except tables and time grids, which run full-bleed across the panel on purpose.

### 1.3 Identity signatures — what makes it recognizable

These ten traits must survive in every product. If a generated page lacks three or more, it is off-brand.

| # | Signature | Evidence in references |
|---|---|---|
| 1 | **Inset panel shell** — white rounded panel floating 12px inside a light gray shell; sidebar sits directly on the shell. | All 8 screens [O] |
| 2 | **Ambient-tinted shell** — the shell carries a faint hue wash at top-left fading to neutral `#F5F5F5`. | Mint-gray, cool-gray, lilac, sand tints across screens [O] |
| 3 | **Ink selection** — selected/primary = solid black with white text. | Selected date "9", "Feb" chip, "All" chip, "2 – Tue" header, "+ Add new exam", count badges, "8:40" marker [O] |
| 4 | **Selection inversion** — white pill = selected on gray. | Active nav item is a white pill on the gray shell [O] |
| 5 | **Pastel washes + white chips** — tinted tiles hold white circular icon chips and white pills. | Attendance/Absences/Delayed tiles, exam cards with white "Confirmed" pills [O] |
| 6 | **Pill / rect / circle grammar.** | Chips, buttons, nav = pills; cards = rounded rects; dates, avatars, icon chips = circles [O] |
| 7 | **Hairline regions** — full-bleed 1px dividers split the panel into header, toolbar, content, rail. | Below page header, around section headers, between main and rail [O] |
| 8 | **Medium-weight, small-size type** — 24px/500 titles, 13–14px body, no bold. | All titles and values [O] |
| 9 | **Micro data glyphs** — tally bars, small sparklines, dot labels, event dots. | Tally bars in status tiles, sparkline in Growth, dot-labels in Activity, dots under calendar dates [O] |
| 10 | **Black count badges** — 18px black circles with white numerals. | Messages "2", Filter "1", lane counts "23", "1" [O] |

### 1.4 What this system is not

No colored primary buttons. No dark sidebar. No heavy drop shadows. No decorative gradients, glassmorphism or glows. No ALL-CAPS eyebrow labels. No bold headlines. No borders around every group. No saturated full-color fills larger than a dot, glyph, bar or line.

---

## 2. Reference analysis and extracted principles

### 2.1 Reference inventory

| Screen | What it demonstrates |
|---|---|
| **Attendance** (zoomed + full) | Month calendar with circular day cells; three status tiles (success/caution/pending washes) with tally bars; Kanban-style status lanes (gray columns, white pill rows with tinted initials); class filter chips with ink active state. |
| **Student overview** (zoomed + full) | Entity header (avatar + name + chevron switcher); three bordered metric cards with sparkline, mini bar chart, dot-label counts; four interactive status tiles; two full-bleed tables with right-aligned status badges; per-section Filter buttons. |
| **Exams** (zoomed + full) | Section header with month pager (pill chips); day-indexed rows of tinted record cards (code tile, inner white card, darker footer band with white pills); split layout with a right rail (calendar with event dots, upcoming list); primary ink button "+ Add new exam". |
| **Schedule** (zoomed + full) | Week time-grid; category filter chips; ghost dropdowns; today's column header as an ink block; pastel event blocks with overlaps; ink "now" line with time pill; colored circular quick-action buttons per day. |

Presentation context [O]: the screenshots are phone captures of a design-showcase post. The gray backdrop behind the app, the large outer frame radius and the frame's drop shadow belong to the showcase, not the UI (§2.4).

### 2.2 Recurring rules (consistent across all screens)

| Rule | Evidence |
|---|---|
| Shell → panel → regions → components, never deeper than 3 visual levels. | Panel holds regions; regions hold cards/lanes; cards hold chips. |
| The topbar is a bordered bar *inside* the panel, inset 12px, holding breadcrumb (left) and 40px icon buttons (right). | All full-frame screens. |
| Every page starts with a page header: 24px/500 title, one-line 13px gray description, then a full-bleed hairline. | Attendance, Exams, Student overview, Schedule (toolbar variant). |
| Section headers are 16px/500 with a right-aligned outline "Filter" pill carrying a black count badge. | Last assignments, Student exams, Exam Calendar, Upcoming exams. |
| Status is always encoded twice: a hue **and** a glyph/label (✓ success, × negative, ◌ pending). | Tiles, lanes, badges. |
| White elements sit on tinted elements, tinted elements sit on white. Never tint-on-tint, never white-on-white without a hairline. | White chips on washes; washes on panel; white bordered cards on panel. |
| Gray `#F5F5F5`-ish pills are the "available, not selected" state of anything selectable. | Month chips, class chips, filter chips, calendar days with data. |
| Quiet empty states: "No exam.", "Weekend" in light gray text inline in the row. | Exams day list. |

### 2.3 Key measurements

Converted to design pixels assuming a 1440px-wide desktop frame (frame aspect ≈ 1.47, i.e. ~1440×980). All **[M]**.

| Element | Measured | System value |
|---|---|---|
| Shell gutter around panel | ≈ 12 | **12** |
| Sidebar width (to panel edge) | ≈ 284 incl. gutter | **272** + 12 gutter |
| Nav item height / pitch | ≈ 32 / 40 | **32 / 8 gap** |
| Topbar height | ≈ 60–62 | **60** |
| Icon buttons (topbar) | ≈ 40 | **40** |
| Page title | ≈ 24px, medium | **24/32, 500** |
| Section title | ≈ 16px, medium | **16/24, 500** |
| Nav label / card title | ≈ 14px, medium | **14/20, 500** |
| Table cells / list rows | ≈ 13px | **13/20** |
| Table header / metadata | ≈ 12px | **12/16** |
| Metric value | ≈ 24px, medium | **24/32, 500, tabular** |
| Status tile height / icon chip | ≈ 72 / 40 | **72 / 40** |
| Metric card height | ≈ 150 | **min 144** (content-driven) |
| Table row / header row | ≈ 44 / 40 | **44 / 40** |
| Lane row (white pill) | ≈ 32, pitch 36 | **32 / 6 gap** |
| Chips, buttons | ≈ 32 | **32** |
| Calendar day circle / pitch | ≈ 44 / 50 | **44 / 6 gap** |
| Record card (exam) | ≈ 200 × 146 | **200 wide**, content height |
| Code tile in record card | ≈ 32 | **32** |
| Time-grid hour height | ≈ 80 | **80** |
| Shell corner radius (presentation) | ≈ 24 | not used on desktop (§2.4) |
| Panel radius | ≈ 16 | **16** |
| Card grid gap | ≈ 11–12 | **12** |
| Lane / record-card gap | ≈ 8 | **8** |

Sampled colors (approximate, JPEG-compressed) [M]: panel `#FFFFFF`; shell top tints `#E1E8E7` (mint), `#E3E6E8` (cool), `#E5DFE9` (lilac), `#E9E8E5` (sand); shell bottom `#F5F5F5`; lane fill `#FAFAFA`; chip fill `#F5F5F5–#F7F7F7`; status washes `#F7FCFB` (mint), `#FCF8F6` (peach), `#F8F7FF` (lavender); record-card tints `#CFD5FB`, `#FCEFD1`, `#F8D8D0`, `#D9FDEC`; event tints `#E8E1FB`, `#E3F3FD`, `#D0D5F9`, `#D5F6E0`; selected fill `#000000`; title text `≈#0A0A0A`; description text `≈#717171`; muted labels `≈#9B9EA0`.

### 2.4 Incidental details — do NOT turn into rules

| Observed | Why it is incidental | System decision [S] |
|---|---|---|
| Gray backdrop, 24px outer frame radius, big frame shadow | Showcase presentation. | On desktop the shell fills the viewport edge to edge, no outer radius or shadow. |
| Shell tint changes per screen (mint, lilac, sand, cool) | Likely art-direction per shot. | One **ambient hue per product** (§3.7). Optional per-module tint only if modules are truly distinct apps. |
| Page header text inset varies (≈24 / 32 / 56px) | Inconsistency. | One content inset: **24px**. |
| Section label alignment differs between sidebar groups | Inconsistency. | Group labels align with nav item padding (§8.2). |
| Description copy duplicated across pages; typos ("Not-deliverd") | Placeholder content. | Write real, page-specific descriptions. |
| Muted label gray ≈ `#A0A0A0` on white (≈2.6:1) | Fails WCAG AA. | Darkened to `#737373` / `#616161` (§3.9). |
| Initials drawn in pale hue colors on near-white | Fails contrast. | Initials use the hue's `-800` ink on its `-100` soft fill. |
| Emoji inside a growth badge | One-off. | Use icon glyphs, not emoji, in UI chrome. |

### 2.5 The three layers

**Layer A — Core design identity (never changes between products)**
Token values for neutrals, ink, pastel hue families, typography scale, spacing scale, radius scale, shadows; the inset-panel shell; selection inversion; pill/rect/circle grammar; hairline regions; status-encoding rule (hue + glyph); type weights; motion tokens; focus ring.

**Layer B — Reusable UI patterns (adapt freely, keep their internal spec)**
Sidebar groups, topbar, page header variants, section headers, split rail, lanes, dashboard grid, metric card, status tile, record card, table, calendar, time grid, filter toolbar, overlays, empty/loading/error states. A product uses only the patterns it needs, in any arrangement.

**Layer C — Product-specific decisions (must change per product)**
Ambient hue, logomark, nav items and grouping, page set and information architecture, which metrics/records exist, status vocabulary (mapped onto the semantic hues), categorical hue assignment, data-viz types, copy.

---

## 3. Color system

### 3.1 Principles

- **90 / 8 / 2 rule [S].** By visible area: ~90% white and neutral grays, ~8% pastel washes and tints, ≤2% ink black and saturated glyph colors. If a screen looks colorful at a glance, it is wrong.
- **Black is the brand [O].** There is no blue/purple "primary". Ink carries emphasis, selection and primary action.
- **Hue = meaning [O].** Every hue on screen encodes a status or a category. Decorative color is forbidden.
- **Tint pairs [O].** Each hue is used as a family: a pale background (wash/soft/tint) plus a stronger glyph shade. Never use a saturated shade as a large background.

### 3.2 Neutral ramp [M/S]

| Token | Hex | Primary use |
|---|---|---|
| `--neutral-0` | `#FFFFFF` | Panel, cards, white pills, inputs |
| `--neutral-25` | `#FCFCFC` | Calendar days without data, faint hover on white |
| `--neutral-50` | `#FAFAFA` | Lanes, weekend columns, table row hover, rail sub-surfaces |
| `--neutral-75` | `#F5F5F5` | Chips, soft buttons, calendar days with data, tracks, shell base |
| `--neutral-100` | `#F0F0F0` | Region dividers, time-grid lines, soft-button hover |
| `--neutral-150` | `#EBEBEB` | Card and topbar borders, outline-button borders, pressed soft |
| `--neutral-200` | `#E3E3E3` | Tally-bar inactive, skeleton highlight, switch track off |
| `--neutral-300` | `#D4D4D4` | Input borders, checkbox borders, input hover |
| `--neutral-400` | `#A3A3A3` | Disabled text, chevrons in lists, kbd chip fill |
| `--neutral-500` | `#8A8A8A` | Decorative icons only (never text) |
| `--neutral-600` | `#737373` | Tertiary text (on white/subtle surfaces only) |
| `--neutral-700` | `#616161` | Secondary text, descriptions, metadata |
| `--neutral-800` | `#2E2E2E` | Icon default on white |
| `--neutral-900` | `#171717` | Strong icons, ink hover tone |
| `--neutral-950` | `#0A0A0A` | Primary text |
| `--black` | `#000000` | Ink fills (selected, primary, badges, tooltips) |

### 3.3 Ink [O]

| Token | Hex | Use |
|---|---|---|
| `--ink` | `#000000` | Primary button, selected chip/date/segment-on-white, count badges, tooltip, toast, now-marker, today header |
| `--ink-hover` | `#262626` | Hover on ink surfaces |
| `--ink-pressed` | `#0F0F0F` | Pressed ink (paired with no transform; see §10) |
| `--on-ink` | `#FFFFFF` | Text/icons on ink |
| `--on-ink-muted` | `rgba(255,255,255,0.64)` | Secondary text on ink (toasts, tooltips) |
| `--signal` | `#F08A3C` | 6px attention/unread dots only [M ≈ orange dot on the messages icon]; never text or fills |
| `--danger-solid` | `#B5452F` | Danger button fill only (5.4:1 with white) [S] |

### 3.4 Pastel hue families [M/S]

Seven families. Each has seven steps with fixed roles. Steps 50–300 are backgrounds; 400 is for chart fills and soft bars; 600 is for glyphs, strokes, dots and thin bars (all ≥3:1 on white); 800 is for text on that family's backgrounds (all ≥7:1 on its 100).

| Family | 50 *wash* | 100 *soft* | 200 *tint* | 300 *band* | 400 *fill* | 600 *glyph* | 800 *ink* |
|---|---|---|---|---|---|---|---|
| **violet** (lavender) | `#F8F6FF` | `#F0ECFE` | `#E6DFFC` | `#D3C8F7` | `#A894EE` | `#6C4FD6` | `#3F2A8C` |
| **indigo** (periwinkle) | `#F5F6FE` | `#E9ECFD` | `#D2D7FA` | `#BAC0E6` | `#9AA3EC` | `#4F5BD0` | `#28307A` |
| **sky** | `#F3FAFE` | `#E8F5FD` | `#DCEFFC` | `#C4E1F4` | `#84C2EE` | `#2E8FD6` | `#145079` |
| **mint** | `#F4FBF8` | `#E6F8EF` | `#D4F5E3` | `#C2E5D3` | `#7CCBAE` | `#278F6B` | `#14553E` |
| **butter** | `#FFFBF2` | `#FEF5DF` | `#FCEDCC` | `#EBDDBD` | `#EBC468` | `#B9800F` | `#6E4C07` |
| **coral** (rose) | `#FEF6F4` | `#FCEAE5` | `#F8D9D0` | `#E6C5BC` | `#EC9C8A` | `#C9563F` | `#7A2A1C` |
| **copper** (peach) | `#FDF8F4` | `#FBEEE5` | `#F6DECF` | `#E7CBB8` | `#D69A73` | `#A85E31` | `#6A3517` |

Step roles:

| Step | Role | Reference evidence |
|---|---|---|
| **50 wash** | Large, quiet backgrounds: status tiles, inline alerts, highlighted rows | Attendance/Absences/Delayed tiles |
| **100 soft** | Badges, initials avatars, inner icon tiles, hover of a wash | Status badges, icon tiles in record cards |
| **200 tint** | Record cards, calendar events, category blocks | Exam cards, schedule events |
| **300 band** | Footer bands inside tinted cards; pressed state of a tint; emphasized tint | Exam-card footer strip, "Upcoming exams" cards |
| **400 fill** | Chart areas/bars, tally bars (active), sparkline top color | Growth sparkline, tally bars |
| **600 glyph** | Status icons, dots, chart strokes, thin bars, icon color in white chips | ✓ × ◌ glyphs, event dots |
| **800 ink** | Text that must sit on tinted backgrounds when color is meaningful | Initials, alert titles if colored |

Text on 50–300 backgrounds defaults to `--text-primary` / `--text-secondary` (all ≥4.3:1 on every 200 step). Use `-800` only when the text itself should carry the hue (initials, colored links inside alerts).

### 3.5 Semantic tokens

Components must reference **semantic** tokens, never raw ramps — except categorical color, which references a family by name.

**Surfaces**

| Token | Value | Use |
|---|---|---|
| `--surface-shell` | `--neutral-75` + ambient gradient (§3.7) | App background, sidebar |
| `--surface-panel` | `--neutral-0` | Main content panel |
| `--surface-raised` | `--neutral-0` | Cards, white pills, white rows on subtle |
| `--surface-subtle` | `--neutral-50` | Lanes, weekend columns, hover rows, rail sub-areas |
| `--surface-muted` | `--neutral-75` | Chips, soft controls, tracks, day cells with data |
| `--surface-inverse` | `--ink` | Selected-on-white, tooltips, toasts |
| `--surface-overlay` | `--neutral-0` | Popovers, menus, modals, drawers |
| `--scrim` | `rgba(10,10,10,0.32)` | Behind modals/drawers |

**Text**

| Token | Value | Contrast on white | Use |
|---|---|---|---|
| `--text-primary` | `#0A0A0A` | 19.8 | Titles, values, nav labels, primary cells |
| `--text-secondary` | `#616161` | 6.2 | Descriptions, metadata, secondary cells, labels on the shell |
| `--text-tertiary` | `#737373` | 4.7 | Table headers, breadcrumb parents, helper text — **white/subtle surfaces only** |
| `--text-disabled` | `#A3A3A3` | 2.5 | Disabled controls, out-of-month days (exempt as inactive UI) |
| `--text-inverse` | `#FFFFFF` | — | On ink |
| `--text-link` | `--text-primary` + underline on hover | — | Links are ink, not blue |

**Borders and dividers**

| Token | Value | Use |
|---|---|---|
| `--border-divider` | `--neutral-100` `#F0F0F0` | Full-bleed region hairlines, table header rules, grid lines |
| `--border-subtle` | `--neutral-150` `#EBEBEB` | Cards, topbar, outline buttons, popovers |
| `--border-control` | `--neutral-300` `#D4D4D4` | Inputs, checkboxes, radios |
| `--border-strong` | `--neutral-950` | Focused inputs, selected outline cards |

**Interactive**

| Token | Value | Use |
|---|---|---|
| `--action-primary` | `--ink` | Primary button bg |
| `--action-primary-hover` | `--ink-hover` | |
| `--action-soft` | `--neutral-75` | Soft buttons, chips (unselected) |
| `--action-soft-hover` | `--neutral-100` | |
| `--action-soft-pressed` | `--neutral-150` | |
| `--action-ghost-hover` | `rgba(10,10,10,0.04)` | Ghost buttons, nav hover on shell, menu items |
| `--selected-on-panel` | `--ink` (text `--on-ink`) | Selection on white surfaces |
| `--selected-on-shell` | `--neutral-0` + `--shadow-xs` | Selection on gray/tinted surfaces |
| `--focus-ring` | `0 0 0 2px var(--focus-gap), 0 0 0 4px var(--ink)` | All focusable elements |
| `--focus-gap` | surface color behind the element (default `#FFFFFF`) | |

### 3.6 Status semantics

Products map their own vocabulary onto these six semantic statuses. Each status always shows **hue + glyph + text label**.

| Semantic | Family | Glyph | Meaning | Reference examples | Other-product examples |
|---|---|---|---|---|---|
| `success` | mint | ✓ check | Done, present, healthy, paid | Attendance, Complete, Confirmed, Present | Deal won, deployed, paid, passing |
| `pending` | violet | ◌ loader / ○ ring | In progress, waiting, scheduled | Delayed, Not checked | In review, processing, queued, draft |
| `warning` | butter | × or ! | Needs attention soon, incomplete | Not completed, Events | Expiring, at risk, low stock |
| `caution` | copper | ◌ / × | Missing, late, overdue (soft negative) | Absences, Not delivered | Overdue invoice, SLA breach soon |
| `danger` | coral | × / ! triangle | Failed, blocked, destructive | Absent | Failed payment, error, churned, delete |
| `info` | sky | i / ~ | Neutral information, references | Exams card icon | Notes, tips, system notices |
| `neutral` | neutral | • | Inactive, archived, unknown | — | Archived, paused |

Status token pattern (repeat for each):
```
--status-success-wash:  var(--mint-50);
--status-success-soft:  var(--mint-100);
--status-success-tint:  var(--mint-200);
--status-success-band:  var(--mint-300);
--status-success-fill:  var(--mint-400);
--status-success-glyph: var(--mint-600);
--status-success-ink:   var(--mint-800);
```

**Indigo** is not assigned to a status; it is the first categorical hue and the default for "neutral record" tints.

### 3.7 Ambient hue (product-specific, Layer C)

Each product picks **one** ambient hue. It tints only: the shell gradient, single-series charts/sparklines, and optionally the logomark. It never tints buttons, text or selection. This is how products in the portfolio look like siblings rather than clones.

| Preset | `--shell-tint` | `--ambient-fill` | `--ambient-glyph` | Suggested product type |
|---|---|---|---|---|
| neutral | `#E2E6E9` | `--indigo-400` | `--indigo-600` | Admin, developer tools |
| mint | `#DFE9E6` | `--mint-400` | `--mint-600` | Finance, health, ops |
| violet | `#E5DEEA` | `--violet-400` | `--violet-600` | AI, analytics, creative |
| sand | `#EAE7E2` | `--butter-400` | `--copper-600` | CRM, scheduling, people |
| sky | `#DDE7EF` | `--sky-400` | `--sky-600` | Communication, support |
| rose | `#EDE1DE` | `--coral-400` | `--coral-600` | Commerce, marketing |

Shell background recipe [M/S]:
```css
--surface-shell:
  radial-gradient(140% 70% at 0% 0%, var(--shell-tint) 0%, rgba(245,245,245,0) 70%),
  linear-gradient(180deg, #EEEEEE 0%, #F5F5F5 55%, #F7F7F7 100%);
```

### 3.8 Categorical color rules

- **Order** for categories (record types, calendar subjects, chart series): `indigo → butter → coral → mint → sky → violet → copper` [O: exam cards cycle indigo, butter, coral, mint].
- **Stable assignment:** a category keeps its hue everywhere in the product (Math is always indigo/violet). Store the mapping in data, not in components.
- **Max 5 hues per view** for categories. Beyond 5, group into "Other" (neutral) or use a neutral tint with a colored 8px dot.
- **People/initials:** hash the person's ID to one of the seven families; render initials in `-800` on `-100`.
- **Never** reuse a status hue for a category in the same view where that status also appears (e.g., avoid a mint "Biology" tag next to mint "Complete" badges); fall back to indigo/sky/violet for categories.

### 3.9 Contrast rules [S]

- Body and label text ≥ 4.5:1 against its actual background. `--text-tertiary` is allowed only on `--surface-panel` and `--surface-subtle`; on the shell, chips and tints use `--text-secondary`.
- Glyphs and chart strokes (`-600`) ≥ 3:1 on white — satisfied by the ramp.
- Pastel tints (200) are never the only differentiator; always pair with a label or glyph.
- Status badge text is `--text-primary`, not colored.
- Focus ring is ink (≥19:1 on white).
- Input borders (`#D4D4D4`) rely on visible labels for identification; in a high-contrast mode raise to `--neutral-500`.

### 3.10 Dark theme (provisional, extrapolated — not in references) [S]

Use only if a product requires dark mode. Principles: the shell becomes the darkest layer, the panel slightly lifted, **ink inverts to near-white**, pastel families shift to low-lightness tints.

```css
[data-theme="dark"] {
  --surface-shell: radial-gradient(140% 70% at 0% 0%, rgba(255,255,255,0.04) 0%, transparent 70%), #0C0C0C;
  --surface-panel: #141414;
  --surface-raised: #1A1A1A;
  --surface-subtle: #181818;
  --surface-muted: #222222;
  --surface-overlay: #1C1C1C;
  --ink: #F2F2F2;  --ink-hover: #FFFFFF;  --on-ink: #0A0A0A;
  --text-primary: #EDEDED;  --text-secondary: #A1A1A1;  --text-tertiary: #8A8A8A;  --text-disabled: #5C5C5C;
  --border-divider: #222222;  --border-subtle: #262626;  --border-control: #3A3A3A;
  /* Family backgrounds: mix the 600 glyph at 12% (wash), 18% (soft), 26% (tint), 34% (band) over --surface-panel.
     Glyphs: use the 400 step. Inks: use the 100 step. */
}
```

---

## 4. Typography

### 4.1 Family [O/S]

The references use a neutral grotesk with Inter's proportions (double-storey *a*, flat-topped *t*, open apertures, tabular-capable figures).

```css
--font-sans: "Inter", "Inter Variable", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
--font-mono: "JetBrains Mono", "SF Mono", ui-monospace, Menlo, Consolas, monospace; /* code only */
```

- One family for everything. No display serif, no second sans.
- Enable `font-feature-settings: "cv05" 1, "ss03" 0;` only if your Inter build supports them; otherwise default features. Always `-webkit-font-smoothing: antialiased`.
- Monospace is only for code, IDs that users copy, and API keys — never for numbers or labels.

### 4.2 Scale

| Token | Size / line | Weight | Tracking | Use |
|---|---|---|---|---|
| `--type-display` | 32 / 40 | 500 | -0.02em | Auth headline, onboarding step title, large empty state. Max one per screen. [S] |
| `--type-title-lg` | 24 / 32 | 500 | -0.015em | Page title, entity name, date-range title ("01–07 January 2025") [O] |
| `--type-metric-lg` | 24 / 32 | 500 | -0.01em, tabular | Metric card values ("+10%", "19.32") [O] |
| `--type-title-md` | 16 / 24 | 500 | -0.005em | Section titles, month label in pager, modal title, drawer title [O] |
| `--type-metric-md` | 16 / 24 | 500 | 0, tabular | Status tile values ("23/24"), activity counts [O] |
| `--type-title-sm` | 14 / 20 | 500 | 0 | Card titles, lane titles, nav labels, account name, form labels (lg) [O] |
| `--type-body` | 14 / 20 | 400 | 0 | Paragraphs, form inputs, menu items in roomy contexts |
| `--type-body-sm` | 13 / 20 | 400 / 500 | 0 | Page descriptions, table cells, list rows, chips, buttons, breadcrumbs, menu items [O] |
| `--type-label` | 12 / 16 | 500 | 0 | Weekday headers, day-column headers, badge-like labels, dot-labels, small buttons [O] |
| `--type-caption` | 12 / 16 | 400 | 0 | Table headers, metadata, helper text, timestamps, sidebar group labels, time-grid hours [O] |
| `--type-micro` | 11 / 16 | 500–600 | 0.01em | Status badges, count badges, kbd chips, now-marker, initials (10px allowed for 20px avatars) [O] |

Implementation: each `--type-*` role maps to the `--fs-*` / `--lh-*` / `--ls-*` tokens of the same name in §15.1 plus the listed weight (e.g. `--type-title-lg` = `--fs-title-lg` + `--lh-title-lg` + `--ls-title-lg` + 500).

Mobile (<768px): `--type-title-lg` → 20/28; `--type-display` → 28/36; inputs use 16px to prevent iOS zoom. All other sizes unchanged.

### 4.3 Weight rules [O]

- Only **400** and **500** (plus **600** for numerals in count badges and the now-marker). **700 is never used.**
- Hierarchy comes from size and color, not weight. Titles at 500 must still feel calm.
- In a table or list, the primary column is 500 `--text-primary`; other columns are 400 `--text-secondary`.
- Nav labels are 500 in both inactive and active states; the active state changes the surface (white pill), not the weight.

### 4.4 Numeric typography [O/S]

- Apply `font-variant-numeric: tabular-nums` to: metric values, table numeric columns, times, dates in grids, counts, pagination, currency.
- Fractions and ratios use a plain slash with no spaces: `23/24`.
- Signed deltas: always show the sign (`+10%`, `−3.2%` with a true minus U+2212). Color the delta badge (success/danger soft) but keep the number `--text-primary`.
- Currency: symbol before value, thin grouping (`$12,480`); decimals only when meaningful; align decimals in tables (right-aligned + tabular).
- Times: `7:30am – 9:00am` in compact contexts; 24-hour `08:00` in time-grid gutters [O].
- Large numbers in cards: abbreviate ≥10,000 (`12.4k`, `3.1M`) with the exact value in a tooltip.

### 4.5 Text color pairing

| Text role | Color token |
|---|---|
| Titles, values, nav, primary cells | `--text-primary` |
| Descriptions, secondary cells, event times, labels on shell | `--text-secondary` |
| Table headers, breadcrumb parents, helper, quiet empty rows | `--text-tertiary` |
| Disabled, out-of-range dates | `--text-disabled` |
| On ink | `--text-inverse` |

### 4.6 Truncation, wrapping, long content [S]

- **Single-line truncation** with ellipsis for: nav labels, breadcrumb items (middle items collapse to "…" first), table cells (except the primary column, which may wrap to 2 lines), lane rows, chip labels, card titles. Always provide the full value via `title`/tooltip.
- **Two-line clamp** for card descriptions and record titles; never more than 3 lines inside any card.
- **Page descriptions** are one line on desktop (max ~90 characters); wrap naturally on mobile.
- **Long-form text** (notes, AI responses, documents): 14/22 body, max line length 72ch, paragraphs separated by 12px.
- **Numbers never truncate** — abbreviate instead (§4.4).
- Names: "First Last" in lists; initials avatar when no photo.

### 4.7 Copy style [O/S]

- Sentence case for everything: "Last assignments", "Add new exam", "Settings and news". No ALL CAPS, no Title Case For Every Word.
- Buttons are verb-first and specific: "Add event", "Export report", "Mark as present".
- Page descriptions explain what the page lets the user do, in one sentence.
- Empty rows use terse, calm statements: "No exams." — not jokes, not apologies.
- Badges are 1–2 words: "Complete", "Not checked", "4 days left".

---

## 5. Spacing and layout

### 5.1 Spacing scale (4px base, with 2/6/10 half-steps for small components) [M/S]

| Token | Value | Typical use |
|---|---|---|
| `--space-0-5` | 2px | Tally-bar gaps, stacked text gaps |
| `--space-1` | 4px | Icon-to-text in badges, menu padding, gaps inside dense pills |
| `--space-1-5` | 6px | Chip-to-chip gap, lane-row gap, label-to-input gap, breadcrumb gap |
| `--space-2` | 8px | Nav item gap, lane gap, record-card gap, button group gap, card inner gaps |
| `--space-2-5` | 10px | Icon-to-label in nav, inner card padding in tight cards |
| `--space-3` | 12px | Shell gutter, card grid gap, section title → content, lane padding |
| `--space-4` | 16px | Status-tile padding, form field gap, table cell padding, topbar left padding |
| `--space-5` | 20px | Card padding, sidebar horizontal padding |
| `--space-6` | 24px | **Content inset**, section-to-section gap, page header bottom padding, modal padding |
| `--space-8` | 32px | Sidebar group gap, form group gap, auth card padding |
| `--space-10` | 40px | Table first/last cell inset (24 + 16) |
| `--space-12` | 48px | Large empty-state padding |
| `--space-16` | 64px | Page-level empty/error vertical padding |

Never use values outside this scale. If something "needs" 14px or 18px, use 12/16 or 16/20 and fix the component instead.

### 5.2 Shell geometry [O/M]

```
viewport = shell (tinted gradient)
┌──────────────────────────────────────────────────────────────────────────┐
│ ┌──────────────┐ ┌────────────────────────────────────────────────────┐ │
│ │ ⬢          ◫ │ │ ┌────────────────────────────────────────────────┐ │ │ ← topbar: inset 12, h60, r12, 1px border
│ │              │ │ │ Org › ◷ Current page                  [🔔][💬][🔍] │ │ │
│ │ Main menu    │ │ └────────────────────────────────────────────────┘ │ │
│ │ (◷ Active  ) │ │   Page title                       (🔍) [+ Primary] │ │ ← page header: inset 24
│ │  ◫ Item   ⌘M │ │   One-line description of the page                 │ │
│ │  ✉ Item    ② │ ├────────────────────────────────────────────────────┤ │ ← full-bleed hairline
│ │              │ │   main region                     │  rail 360      │ │
│ │ Group two    │ │                                    │                │ │
│ │  ✦ Item      │ │                                    │                │ │
│ │              │ │                                    │                │ │
│ │  ⚙ Settings  │ │                                    │                │ │
│ │ Account      │ │                                    │                │ │
│ │ (◉) Name     │ │                                    │                │ │
│ │     Role     │ │                                    │                │ │
│ └──────────────┘ └────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────────┘
  sidebar 272px     panel: flex 1, radius 16, margin 12px 12px 12px 0
```

| Token | Value | Notes |
|---|---|---|
| `--shell-gutter` | 12px | Space between panel and viewport edges [M] |
| `--sidebar-w` | 272px | Expanded sidebar (includes its own padding) [M] |
| `--sidebar-w-collapsed` | 72px | Icon rail [S] |
| `--sidebar-pad` | 24px 20px 20px 20px | top / right / bottom / left |
| `--topbar-h` | 60px | [M ≈ 62] |
| `--topbar-inset` | 12px | Topbar margin inside the panel [M] |
| `--content-inset` | 24px | Left/right padding for every text-leading block in the panel [S standardizing 16–56] |
| `--rail-w` | 360px | Right rail; min 320, max 400 [M ≈ 380] |
| `--content-max` | none for dashboards; 720px for forms; 960px for settings; 72ch for reading | [S] |

### 5.3 Panel anatomy and insets

- **Chrome inset 12px:** topbar, sticky footers, floating bars sit 12px from panel edges.
- **Content inset 24px:** page title, section titles, card grids, toolbars, lanes area, calendar padding all start at x = 24px.
- **Full-bleed:** hairline dividers, tables, time grids and day-grouped record lists run edge to edge of the panel. Their *text* still aligns to the system: table first-cell padding is 40px (24 + 16), deliberately indenting table text 16px past section titles [O ≈ 44px].
- **Rails** have their own 24px inset on both sides.

### 5.4 Vertical rhythm

| Between | Space |
|---|---|
| Panel top → topbar | 12 |
| Topbar → page title (top of line box) | 28 |
| Page title → description | 4 |
| Description → header divider | 24 |
| Header divider → first section (inline section title) | 24 |
| Section title → section content | 12 |
| Section → section (stacked, no dividers) | 24 |
| Divided section header (56px row) → content | 0 (content has its own padding 16–24) |
| Card header → card value | flexible; card uses `justify-content: space-between`, min 24 |
| Form field → field | 16 |
| Label → input | 6 |
| Input → helper/error | 6 |
| Form group → form group | 32 + hairline |
| Last content → panel bottom | 24 (scroll padding) |

### 5.5 Grids and columns [O/S]

| Pattern | Definition |
|---|---|
| Metric card row | `grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px;` 3–4 per row on desktop |
| Status tile row | `repeat(auto-fit, minmax(200px, 1fr)); gap: 12px;` (vertical stacks: gap 12) |
| Split with rail | `grid-template-columns: minmax(0,1fr) 1px var(--rail-w);` (1px column = divider) |
| Lead column + board | `grid-template-columns: 400px minmax(0,1fr);` lead holds calendar/tiles; board holds lanes |
| Lanes | `display:flex; gap: 8px; overflow-x:auto;` lanes `flex: 1 0 220px; max-width: 320px` |
| Record cards | `display:flex; flex-wrap: wrap; gap: 8px;` cards 200px |
| Generic 12-col | 12 columns, gap 12, used only when a dashboard needs mixed spans (8/4, 6/6, 4/4/4) |

### 5.6 Component dimensions

| Element | Size |
|---|---|
| Control heights | xs 24 · sm 28 · **md 32 (default)** · lg 40 · xl 48 |
| Buttons | 32 in the app; 40 on auth, onboarding and mobile |
| Inputs | 40 in forms · 32 in toolbars · 48 in auth and command palette |
| Icon sizes | 12 · 14 · 16 · 18 · 20 · 24 |
| Avatars | 20 · 24 · 32 · 40 · 56 |
| Count badge / status badge | 18 / 20 |
| Nav item | 32 tall, full width of sidebar content |
| Topbar icon button | 40 square |
| Table header / row | 40 / 44 (compact 32 / 36) |
| Lane row | 32 |
| Section header (divided) | 56 |
| Status tile | 72 |
| Metric card | min 144 |
| Record card | 200 wide (184–240) |
| Calendar day | 44 (compact/mobile 36) |
| Time grid hour | 80 (compact 56) |
| Modal widths | 400 · 560 · 720 |
| Drawer widths | 400 · 560 · 720 |
| Popover | 180–360 wide |
| Tooltip | max 240 wide |

### 5.7 Density

- **Comfortable (default)** — the references.
- **Compact** — for data-dense products, enabled with `[data-density="compact"]` on the shell: nav gap 2px, table header/row 32/36, section header 48, card padding 16, page header padding 20/24/16, calendar day 36, hour 56. Type sizes do **not** change.

### 5.8 Alignment rules

- Left-align all text and blocks. Center only empty states, auth cards, calendar numerals, and multi-count metric columns.
- Right-align: numeric table columns, status column in tables [O], page-header actions, section-header actions, card-header links.
- Vertically center icons with the first line of text. Icons sit on the text's optical center, never the baseline.
- Everything text-leading in the panel shares x = 24px. Check this with a vertical guide before shipping.
- Within a card or tile, the icon chip, title and value share one left edge (card padding).

### 5.9 Density vs whitespace balance

- Inside a component: tight (6–12px).
- Between sibling components: 8–12px.
- Between sections: 24px or a hairline.
- Around the page: 24px inset, 12px shell gutter.
- Never pad a dense table with extra card padding. Never put more than 24px of empty space between related elements.

---

## 6. Borders, radii, shadows and surface hierarchy

### 6.1 Surface levels

| Level | Surface | Treatment |
|---|---|---|
| L0 | Shell (sidebar + gutter) | Ambient gradient, no border |
| L1 | Panel | White, radius 16, no border, no shadow (optional `0 0 0 1px rgba(10,10,10,0.03)` ring) |
| L2 | Regions | Separated by full-bleed 1px `--border-divider`; sub-areas use `--surface-subtle` |
| L3 | Objects | Bordered white cards (r16), status washes (r16), tinted record cards (r12), lanes (r12) |
| L4 | Chips on objects | White pills/chips on tints with `--shadow-xs`; white icon chips on washes with `--shadow-sm` |
| L5 | Overlays | Popovers/menus (`--shadow-md` + border), modals/drawers/toasts (`--shadow-lg`) |

**Composition rules [O]:**
- Max depth inside the panel is L4.
- White-on-tint and tint-on-white are allowed. Tint-on-tint is forbidden, except a family's own 300 band and 100 icon tiles inside its 200 card.
- Never nest a bordered white card inside another bordered white card. Use a hairline or spacing instead.
- Do not wrap tables, calendars, time grids, or lists of lanes in cards.

### 6.2 Radius scale

| Token | Value | Use |
|---|---|---|
| `--radius-2xs` | 4px | Kbd chips, checkboxes, skeleton text bars, heatmap cells |
| `--radius-xs` | 6px | Tiles ≤ 24px, small tags in dense tables |
| `--radius-sm` | 8px | Calendar events, 32px code/icon tiles, tooltips, menu items, 32px inputs |
| `--radius-md` | 10px | Inputs 40/48, textareas, square icon buttons, inner white card inside a record card |
| `--radius-lg` | 12px | Topbar, record cards, lanes, popovers/menus, toasts, inline alerts |
| `--radius-xl` | 16px | Panel, metric cards, status tiles, modals, drawers, auth card |
| `--radius-2xl` | 24px | Mobile bottom-sheet top corners only |
| `--radius-full` | 9999px | Buttons, chips, nav items, badges, avatars, day cells, icon chips, switches, lane rows, progress bars |

**Nesting rule:** a child container uses one step smaller than its parent (16 → 12 → 10 → 8). Pills and circles are exempt.

**Shape grammar [O]:**
- **Pill** = something you press or toggle (buttons, chips, nav items, filters, badges, lane rows).
- **Rounded rectangle** = something that holds content (panel, cards, inputs, popovers, events).
- **Circle** = an identity or a point in time (avatars, dates, icon chips, status dots, now-marker pill is the exception as a label).
- **Square corners** only where an element attaches to a grid: the today column header [O] and table header rules.

### 6.3 Borders

- Always 1px, except checkbox/radio borders (1.5px), the time-grid now-line (2px) and focus rings (2px).
- `--border-divider` `#F0F0F0`: region separators, table header rules, time-grid lines.
- `--border-subtle` `#EBEBEB`: topbar, metric cards, outline buttons, square icon buttons, popovers, white pills placed on white.
- `--border-control` `#D4D4D4`: inputs, checkboxes, radios.
- `--border-strong` (ink): focused inputs, selected outline cards.

**No borders on:** the panel, status tiles, record cards, lanes, calendar events, chips, nav items, badges, toasts. These separate by fill.

### 6.4 Shadows

| Token | Value | Use |
|---|---|---|
| `--shadow-none` | `none` | Default for everything |
| `--shadow-xs` | `0 1px 2px rgba(10,10,10,0.05)` | Active nav pill, segmented thumb, white pills on tints, hovered lane rows |
| `--shadow-sm` | `0 1px 2px rgba(10,10,10,0.04), 0 2px 8px rgba(10,10,10,0.05)` | White icon chips on washes [O], overlapping calendar events [O], hovered record cards |
| `--shadow-ink` | `0 2px 6px rgba(0,0,0,0.16)` | Selected ink chip in a scrolling pager [O "Feb"] |
| `--shadow-md` | `0 1px 3px rgba(10,10,10,0.05), 0 8px 24px rgba(10,10,10,0.08)` | Popovers, menus, dragged items |
| `--shadow-lg` | `0 2px 6px rgba(10,10,10,0.05), 0 24px 48px rgba(10,10,10,0.12)` | Modals, drawers, toasts, command palette |

Cards are separated by borders, not shadows. Hover never adds a shadow to static cards.

### 6.5 Dividers

- Horizontal region divider: 1px `--border-divider`, full panel width (or full rail width), no margin.
- Vertical split divider: 1px `--border-divider`, full region height.
- Inset list dividers (rare): start at the content inset (24px), used only for multi-line list rows.
- Menu separators: 1px, margin 4px 0, full menu width.

### 6.6 Gradients (exactly two)

1. **Shell ambient gradient** (§3.7).
2. **Chart area fill**: vertical gradient from `{hue}-400` at 80% opacity to `{hue}-100` at 0%.

Skeleton shimmer is an animation, not a surface gradient, and is allowed. Nothing else uses gradients: not buttons, cards, headers, text, borders or backgrounds.

---

## 7. Iconography and visual assets

### 7.1 Icon style [O]

- Outline icons, rounded caps and joins, geometric and friendly, 1.5px stroke on a 24px grid (renders ≈1.1–1.25px at 16–18px).
- Recommended sets: **Lucide** (`strokeWidth={1.5}`) or **Hugeicons Stroke Rounded**. Pick one per portfolio and never mix sets.
- Filled icons are allowed only as category markers in card headers (§7.3) and as status glyphs inside badges.

### 7.2 Sizes and colors

| Size | Use | Color |
|---|---|---|
| 12 | Badge glyphs, breadcrumb separators, sort arrows | status glyph / `--neutral-400` |
| 14 | Button icons, chevrons in rows, info icons, check in chips | inherit text / `--neutral-400` for chevrons |
| 16 | Inline icons, card header icons, icon chips' glyphs, menu items, input icons | `--neutral-800` / status glyph |
| 18 | Nav icons, topbar icon buttons, collapse toggle | `--text-primary` / `--neutral-800` |
| 20 | Mobile nav, empty-state chips | `--neutral-800` |
| 24 | Large empty states, auth | `--neutral-800` |

On ink surfaces, icons are white. Disabled icons use `--text-disabled`.

### 7.3 Icon containers

| Container | Spec | Use |
|---|---|---|
| **Icon chip** [O] | 40px circle, white, `--shadow-sm`, 16px glyph in status `-600` | On washes: status tiles, inline alerts, empty states on tints |
| **Soft icon chip** [S] | 40–48px circle, `--surface-muted`, 20px glyph `--neutral-800` | Empty states on white |
| **Icon tile** [O] | 32px square, radius 8, `{hue}-100`, 16px glyph `--neutral-800` | Inside record cards and list rows |
| **Code tile** [O] | 32px square, radius 8, white, 12/16 600 tabular text | Short identifiers ("302", "A-12") on tinted cards |
| **Card category marker** [O] | 18px filled glyph in `{hue}-600`, or an 18px radius-5 tile in `{hue}-400` with a white 12px glyph | Metric card headers (Growth, Exams, Activity) |

### 7.4 Logomark (product-specific)

- 36px mark in the sidebar header. Reference uses an ink rounded-hexagon with a white glyph [O]; keep "ink container + white glyph" as the rule, while shape and glyph are product-specific.
- In the collapsed sidebar, the logomark is the only header element.

### 7.5 Avatars and imagery

- Photos are circular, no border; stacked avatars get a 2px ring in the surface color.
- Initials avatars use `{hue}-100` background and `{hue}-800` text; hue = hash(id) mod 7.
- **No illustrations, 3D art, stock photography or emoji** in product chrome. Empty states use icon chips. Marketing-grade imagery may appear only on auth split screens (§8.12), desaturated and inside a radius-16 frame.

### 7.6 Keyboard hints [O]

16×16 chips, radius 4, fill `--neutral-400`, white 10/16 600 glyph ("⌘", "M"). Gap 4 between keys. Marked `aria-hidden`; expose the shortcut via `aria-keyshortcuts` and tooltips.

---

## 8. Application shell and layout patterns

Each pattern lists **purpose → composition → spacing → adaptation**. Patterns are building blocks; a page uses only what it needs.

### 8.1 Application shell [O]

- **Purpose:** persistent frame that makes every product recognizable.
- **Composition:**
  ```css
  .app      { display:grid; grid-template-columns: var(--sidebar-w) minmax(0,1fr);
              height:100dvh; background: var(--surface-shell); overflow:hidden; }
  .sidebar  { padding: var(--sidebar-pad); display:flex; flex-direction:column; min-height:0; }
  .panel    { margin: var(--shell-gutter) var(--shell-gutter) var(--shell-gutter) 0;
              background: var(--surface-panel); border-radius: var(--radius-xl);
              display:flex; flex-direction:column; min-width:0; overflow:hidden; }
  .panel-scroll { flex:1; overflow:auto; }   /* the panel scrolls, the viewport never does */
  ```
- The viewport never scrolls; the panel body does. The topbar is sticky inside the panel.
- **Adaptation:** §11. The outer rounded frame and drop shadow from the references are presentation only (§2.4).

### 8.2 Sidebar navigation [O]

**Header row** — height 40: logomark 36 (left), collapse toggle (ghost icon button 32, "panel-left" icon 18) right. Margin below: 28.

**Groups** — each group = label + item list. Gap between groups: 32.
- Group label: 12/16 400, `--text-secondary`, padding-left 12 (aligns with item icons), margin-bottom 8. Sentence case ("Main menu", "Settings and news").

**Nav item** — height 32, radius full, padding 0 12, gap 10, icon 18 + label 14/20 500 `--text-primary`, item gap 8 (compact: 2).
- Trailing slot (right-aligned, optional, one at a time): count badge (ink 18) [O "2"], kbd hint pair [O "⌘ M"], chevron 14 for expandable items.

| State | Treatment |
|---|---|
| Default | Transparent |
| Hover | `--action-ghost-hover` |
| Pressed | `rgba(10,10,10,0.06)` |
| Current page | White fill + `--shadow-xs` (selection-on-shell) [O]; label stays 500; `aria-current="page"` |
| Focus-visible | Focus ring with gap color = shell |
| Disabled | `--text-disabled`, no hover |

**Expandable item [S]** — chevron rotates 90° (180ms). Children: height 32, padding-left 40 (no icons), label 13/20 400; current child also gets the white pill. Max depth 2.

**Footer** (pinned with `margin-top:auto`):
- "Settings" nav item.
- Group label "Account".
- Account row: avatar 40 + name 14/20 500 + role 12/16 `--text-secondary`, gap 10. The whole row is a button (radius 12, padding 4, hover ghost) that opens the user menu upward (§9.10).

**Collapsed (72px) [S]:** logomark centered; toggle appears below it; items become 44×32 pills with icon only and an ink tooltip on the right (offset 8); count badges become 8px ink dots at the icon's top-right; group labels collapse to 16px spacers; account row becomes avatar 32. Width animates 220ms; labels fade out in 80ms first.

**Nav content rules:** ≤ 9 items in the main group, ≤ 4 groups; labels ≤ 22 characters; every item has an icon; product-specific grouping (Layer C).

### 8.3 Topbar [O]

- Sticky wrapper inside the panel: `position:sticky; top:0; padding: 12px 12px 0; background: var(--surface-panel); z-index: var(--z-sticky)`.
- Bar: height 60, radius 12, 1px `--border-subtle`, white, padding 0 10 0 16, `justify-content: space-between`.
- **Left:** breadcrumb (§8.4).
- **Right:** action cluster, gap 8: square icon buttons 40 (notifications, messages, search/command) [O]; optional user avatar 32 when the account isn't in the sidebar; optional global search pill (32 tall, 240 wide, ⌘K hint).
- **Unread indicator:** 6px `--signal` dot with a 2px white ring at the icon button's bottom-right [O].
- **Optional global progress:** a 2px ink bar along the topbar's bottom edge during background refresh.

### 8.4 Breadcrumbs [O]

- 13/20. Parents: 400 `--text-tertiary`, hover `--text-primary`. Separator: chevron-right 12 `--neutral-400`, gap 6.
- Current page: leading 16px icon (same icon as its nav item) + label 13/20 500 `--text-primary`, gap 6.
- Root is the workspace/organization name [O "Maham", "Techerly"].
- Max 4 visible items; middle items collapse into a "…" menu. Mobile shows only a back chevron + current title.

### 8.5 Page header [O]

Padding: 28px 24px 24px. Ends with a full-bleed hairline (except variant C, which ends where the grid begins).

| Variant | Composition | Reference |
|---|---|---|
| **A. Standard** | Title 24/32 500 + description 13/20 `--text-secondary` (gap 4). Right: up to 1 soft icon button (32 circle) + 1 primary ink button, gap 8, vertically centered to the title block. | Attendance, Exams |
| **B. Entity** | Avatar 32 + entity name 24/32 500 + chevron-down 14 (opens entity switcher popover), gap 10; description below; actions right (e.g. Filter). | Student overview |
| **C. Toolbar / temporal** | One row: range title 24/32 500 ("01–07 January 2025") + chips + ghost dropdowns + spacer + Filter (outline) + primary. Padding 24 24 16; no description. | Schedule |
| **D. Detail** | Back button (soft circle 32, chevron-left) + title 24/32 + inline status badge; actions right; tabs row below (§9.6). | [S] |

Rules: exactly one H1 per page; description is one line; max one primary button; more than three actions → overflow "···" icon button.

### 8.6 Content region patterns

| Pattern | Composition | Reference |
|---|---|---|
| **Stacked sections** | Sections separated by 24px, each with an inline section header (§8.7). | Student overview |
| **Divided sections** | 56px section header rows bounded by full-bleed hairlines; content full-bleed or inset. | Exam calendar |
| **Split rail** | Main + 1px divider + rail 360. Rail is white (same panel), not a card; rail blocks are separated by full-bleed hairlines, each with its own section header. | Exams (calendar + upcoming) |
| **Lead column + board** | Lead column 400 (calendar, status tiles) + board of lanes filling remaining width and height. | Attendance |
| **Dashboard grid** | Metric cards row → status tiles row → tables/lists. | Student overview |
| **Grouped record rows** | Rows bounded by full-bleed hairlines: index gutter 48 (13/20 500 numeral, or ink circle 28 for today [O "6"]) + flex-wrap of record cards (gap 8); row padding 16 24. Empty rows show quiet text ("No exams.", "Weekend") 13/20 `--text-tertiary`, row height 52. | Exams day list |
| **Time grid** | Full-bleed grid, sticky day header, gutter 64. | Schedule |

### 8.7 Section header

- **Inline:** title 16/24 500 at the content inset; right side: Filter outline pill with count badge [O], or a "View all" link 12/16 `--text-tertiary`, or soft icon buttons. Margin-bottom 12.
- **Divided:** height 56, padding 0 24, hairline above and below (shared with neighbors). Same contents. Optional pager (prev/next soft circles 28 + label 16/24 500) [O "‹ February ›"].
- **Card-level:** 18px category marker + title 14/20 500 (gap 8); right link 12/16 `--text-tertiary` [O "Check Exams"].

### 8.8 Filter, search and sort toolbars

- Lives in a page header (variant C), a section header, or a dedicated 56px toolbar row under the header divider.
- Left → right order: category/filter chips → ghost dropdowns (time range, scope) → spacer → search pill (32 × 220) → Filter (outline pill + ink count) → view switch (segmented) → primary action.
- Filter count badge shows the number of active filters and is hidden at 0 [O].
- Optional applied-filters row [S]: removable soft chips + "Clear all" ghost button, 8px below the toolbar.
- Sort lives in table headers (§9.11) or a ghost dropdown ("Newest ⌄").

### 8.9 Forms and configuration pages [S]

- Single-column forms: max-width 720, left-aligned at the content inset (never centered in the panel).
- Field: label 13/20 500 (+ "(optional)" in `--text-tertiary`), input 40, helper 12/16 `--text-tertiary`.
- Groups: title 14/20 500 + description 13/20 secondary, fields below, 32px + hairline between groups.
- Save bar: appears when the form is dirty; sticky at panel bottom, 64px, hairline top, white, padding 0 24; right-aligned "Cancel" (outline) + "Save changes" (ink).

### 8.10 Detail pages and master–detail [S]

- **Detail page:** header variant D → pill tabs row (56px, hairline below) → main content | rail 360 with a properties list (rows 36: label 12/16 `--text-tertiary` width 120, value 13/20 `--text-primary`).
- **Master–detail:** list column 360 (rows 56: avatar 32, title 13/20 500, meta 12/16 secondary, trailing badge/time) + 1px divider + detail region. Selected row: `--surface-muted` fill (large-area selection rule, §10.2).

### 8.11 Page-level empty, loading and error states

- **First-run empty:** centered in the content region below the page header: soft icon chip 48 (20 glyph), title 16/24 500, description 13/20 secondary (max 360, centered), actions: primary ink + outline, gap 8. Vertical padding 64.
- **Region empty:** same with chip 40 and title 14/20 500; padding 48.
- **Quiet empty row:** inline text in `--text-tertiary` [O].
- **Loading:** skeletons mirroring the final layout (§9.17); never a full-panel spinner after boot.
- **Error:** icon chip with `coral-100` fill and `coral-600` glyph; title states what failed ("Couldn't load attendance"); description gives cause + fix; "Try again" outline button. 404/500 use the same block centered in the panel, keeping the shell.

### 8.12 Authentication and onboarding [S]

- **Centered auth:** no sidebar; viewport = shell gradient; white card 400 wide, radius 16, padding 32, no shadow (optional 1px `rgba(10,10,10,0.04)` ring). Logomark 36 top-left; title 24/32 500; description 13/20 secondary; inputs 40; full-width ink button 40; SSO as full-width outline buttons 40 with 16px brand marks; "or" divider (hairline + 12/16 `--text-tertiary`); footer links 12/16.
- **Split auth (≥1024):** left half = shell with a one-sentence product statement (24/32 500) and an optional framed product screenshot (radius 16); right half = white panel inset 12 (radius 16) with the form centered, max-width 360.
- **Onboarding:** same shell; content max-width 520; step indicator = numbered circles 24 (current: ink; done: mint-100 with mint-600 check; upcoming: `--surface-muted`) joined by 1px dividers, or a 4px ink progress bar for >5 steps; footer: "Back" ghost + "Continue" ink.

### 8.13 Settings and profile [S]

- Page header (A) + pill tabs (General · Members · Billing · Notifications) — or, for >6 sections, a secondary vertical nav column 220 inside the panel (items 32, selection = `--surface-muted` pill + 500, see §10.2).
- Settings rows: two columns — left 280 (title 14/20 500 + description 13/20 secondary), right controls (max 480); rows separated by full-bleed hairlines; padding 24.
- Profile: entity header with avatar 56, name, role badge.
- Danger zone: coral-50 wash block, radius 12, padding 16, coral-600 glyph, title 14/20 500, description, danger-outline button.

### 8.14 Overlay placement

| Overlay | Placement |
|---|---|
| Modal | Centered, max-height `calc(100dvh - 48px)`; mobile → bottom sheet |
| Drawer | Floating inset 12px from viewport top/right/bottom, radius 16 |
| Popover / menu | Anchored to trigger: bottom-start, flip/shift to stay 12px inside viewport |
| Tooltip | Top by default, 6px offset; right side in collapsed nav |
| Toast | Bottom-right 24px (desktop), bottom-center above safe area (mobile) |
| Command palette | Top-aligned at 15vh, centered |

### 8.15 Composition recipes (same identity, different architectures)

| Product | Suggested composition |
|---|---|
| **CRM** | Pipeline page = lead column (metric tiles) + board of stage lanes with lane rows; contact detail = variant D + tabs + properties rail; ambient: sand. |
| **Analytics** | Dashboard grid of metric cards → divided sections with chart regions (§13) → full-bleed tables; toolbar with time-range ghost dropdown + compare toggle; ambient: violet. |
| **Project tracker** | Board lanes by status, tinted record cards for tasks (category = project hue), time grid for timeline/calendar, split rail for "Upcoming"; ambient: mint. |
| **AI application** | Stacked sections; conversation/output area as a long-form reading column (72ch) in the panel; prompt input as a 48px input card pinned at panel bottom (radius 12, border-subtle); run history in rail; ambient: violet or neutral. |
| **Finance** | Metric cards with tabular deltas; full-bleed tables with sticky first column; status badges (paid/overdue/failed); ambient: mint. |
| **Developer tool** | Compact density; tables and logs; monospace only inside code blocks; ambient: neutral. |

---

## 9. Component specifications

All values reference tokens from §15.1. "Hover/pressed" follow the global recipes in §10.2 unless stated.

### 9.1 Buttons

**Sizes**

| Size | Height | Padding | Text | Icon | Gap |
|---|---|---|---|---|---|
| sm | 28 | 0 12 | 12/16 500 | 14 | 6 |
| **md (default)** | 32 | 0 14 | 13/20 500 | 14 | 6 |
| lg (auth, onboarding, mobile) | 40 | 0 18 | 14/20 500 | 16 | 8 |

Radius: full. Icon-only buttons are square at the same height (see §9.2).

**Variants**

| Variant | Default | Hover | Pressed | Use |
|---|---|---|---|---|
| **primary** [O] | bg `--ink`, text white | `--ink-hover` | `--ink-pressed` | One per region: create, save, confirm ("+ Add new exam") |
| **outline** [O] | bg white, 1px `--border-subtle`, text primary | bg `--neutral-50`, border `--neutral-200` | bg `--neutral-75` | Secondary actions, Filter, Cancel |
| **soft** [O] | bg `--neutral-75`, text primary | `--neutral-100` | `--neutral-150` | Pager arrows, low-emphasis actions on white |
| **ghost** [O] | transparent, text `--text-secondary` | `--action-ghost-hover`, text primary | `rgba(10,10,10,0.06)` | Toolbar dropdowns ("This week ⌄"), tertiary actions |
| **on-tint** [O] | bg white, `--shadow-xs`, text primary | bg `--neutral-25` | bg `--neutral-50` | Actions placed on pastel tints ("Confirmed", "4 days left") |
| **danger** [S] | bg `--danger-solid` `#B5452F`, text white | `#A13C28` | `#8F3523` | Only in confirmation dialogs |
| **danger-outline** [S] | bg white, 1px `coral-200`, text `coral-800` | bg `coral-50` | bg `coral-100` | Danger zones, destructive menu-adjacent buttons |
| **link** | text primary 500, no padding | underline | — | Inline actions in text |

**Slots:** leading icon (create actions use "+") [O]; trailing chevron for dropdown buttons; trailing count badge (ink 18; on primary buttons use white badge with ink text) [O "Filter ①"].

**States:** disabled = bg `--neutral-75` (primary: `--neutral-150`), text `--text-disabled`, no border change, `cursor:not-allowed`. Loading = 14px spinner replaces the leading icon (or prepends), label stays, width locked, `aria-busy="true"`, click ignored. Focus = `--focus-ring`.

**Groups:** separate buttons gap 8; primary is rightmost. Split button: primary + 32px ink icon-only chevron joined in one pill with a 1px `rgba(255,255,255,0.16)` divider. For mutually exclusive options use a segmented control, not attached buttons.

### 9.2 Icon buttons

| Type | Spec | Use |
|---|---|---|
| **Square bordered** [O] | 40 (also 36/32), radius 10, white, 1px `--border-subtle`, icon 18 `--neutral-800` | Topbar actions |
| **Circle soft** [O] | 28/32, radius full, `--neutral-75`, icon 14/16 | Pager arrows, inline search, back button |
| **Ghost** [O] | 24/28/32, transparent, icon 16/18 `--text-secondary` | Collapse toggle, "···" menus, close buttons |
| **On-tint circle** [O] | 32/36, radius full, `{hue}-200`, icon 14 `{hue}-800` | Category-scoped quick actions (per-column "edit" buttons in the schedule) |

Every icon button has an `aria-label` and an ink tooltip. Hit area ≥ 24×24 (desktop), 44×44 (touch).

### 9.3 Text inputs, textareas and search

| Property | Value |
|---|---|
| Heights | 32 (toolbar, radius 8, text 13/20) · **40 (forms, radius 10, text 14/20)** · 48 (auth/command, radius 10, text 14/20) |
| Fill / border | white / 1px `--border-control` |
| Padding | 0 12; with leading icon 16 → padding-left 36 |
| Placeholder | `--text-tertiary` |
| Label | 13/20 500 primary, 6px above |
| Helper | 12/16 `--text-tertiary`, 6px below |
| Affixes | Units/suffix 13/20 `--text-tertiary`; clear button ghost 20 (shows when filled); kbd hint |

| State | Treatment |
|---|---|
| Hover | border `--neutral-400` |
| Focus | border `--ink` + halo `0 0 0 3px rgba(10,10,10,0.08)` |
| Error | border `coral-600` + halo `rgba(201,86,63,0.15)`; message 12/16 `coral-800` with 12px alert glyph replaces helper; `aria-invalid` |
| Disabled | bg `--neutral-50`, border `--neutral-150`, text `--text-disabled` |
| Read-only | bg `--neutral-50`, border transparent, text primary, selectable |

**Textarea:** min-height 96, padding 10 12, radius 10, vertical resize, optional counter 12/16 `--text-tertiary` bottom-right (turns `coral-800` past limit).

**Search field [S]:** pill, 32 (toolbar) or 40 (page), bg `--neutral-75`, no border, leading search icon 16, trailing "⌘K" hint; focus → white bg + 1px ink border + halo. Debounce 250ms; Esc clears.

### 9.4 Select, dropdown, autocomplete and menus

- **Select trigger:** identical to the input of the same size + trailing chevron-down 14 `--neutral-500`.
- **Ghost dropdown trigger [O]:** text 13/20 500 `--text-tertiary` + chevron 12; hover ghost pill and text secondary; used in toolbars.
- **Menu / listbox surface:** white, 1px `--border-subtle`, radius 12, `--shadow-md`, padding 4, min-width = max(trigger, 180), max-height 320 (scroll).
- **Item:** height 32, radius 8, padding 0 10, text 13/20 400 primary, optional leading icon 16, trailing check 14 for selected (selected label 500), trailing kbd/meta 12/16 tertiary. Hover/active-descendant: `--neutral-75`.
- **Group label:** 12/16 `--text-tertiary`, padding 8 10 4. **Separator:** 1px divider, margin 4 −4.
- **Destructive item:** text `coral-800`, icon `coral-600`, hover `coral-50`; always last, after a separator.
- **Multi-select:** items with checkboxes; trigger shows "3 selected" or the first value + "+2".
- **Autocomplete/combobox:** input + listbox; matched substring rendered 500 (no color); "No results" row in tertiary; loading row with 14px spinner; optional "+ Create "{query}"" item.
- **Keyboard:** ↑/↓, Home/End, Enter selects, Esc closes, type-ahead on listboxes.

### 9.5 Checkbox, radio, switch

| Control | Spec |
|---|---|
| **Checkbox** | 16×16, radius 4, 1.5px `--border-control`, white. Checked/indeterminate: ink fill, white 12px check/dash (2px stroke). Hover border `--neutral-500`. Disabled: `--neutral-75` fill, `--neutral-200` border. Label 13/20, gap 8, hit area 32. |
| **Radio** | 16 circle, 1.5px border. Checked: ink fill with 6px white center dot. |
| **Switch** | Track 32×18 (sm 28×16), radius full; off `--neutral-200`, on `--ink`; thumb 14 white `--shadow-xs`, travel 14, 150ms. Label left or right 13/20. |

On tinted surfaces unchecked controls keep a white fill. Selected control color is always ink (§10.2).

### 9.6 Chips, tabs and segmented controls

**Chip / pill tab [O]** — height 32 (sm 28), padding 0 14, radius full, text 13/20 500, gap between chips 6.

| State | Treatment |
|---|---|
| Unselected | `--neutral-75`, text `--text-secondary` |
| Hover | `--neutral-100`, text primary |
| Selected | `--ink`, white text, optional leading check-circle 14 [O "✓ All", "✓ Class 302"] |
| Disabled | `--neutral-50`, text disabled |

- **Single-select chips** behave as tabs (`role="tablist"`) when they switch content, or as a radio group when they filter.
- **Multi-select chips** use `aria-pressed`; selected ones are ink with the check.
- **Removable chip:** soft chip + trailing × 12 (hit 20), used for applied filters.
- **Pager chips [O months]:** a horizontally scrollable chip row with soft circle prev/next 32 at the ends; the selected chip adds `--shadow-ink`; selecting scrolls it into view.
- **Tabs:** pages and sections use pill tabs. Underline tabs are not part of this system.

**Segmented control [S]** — for view modes (Day/Week/Month, List/Board), 2–4 options: track `--neutral-75`, radius full, padding 3, height 32; segments 26 tall, 12/16 500 `--text-secondary`; selected segment = white + `--shadow-xs` + text primary (selection-on-gray). Thumb slides 220ms.

**Chips vs segmented:** chips filter or switch *content*; segmented switches *presentation* of the same content.

### 9.7 Cards

**9.7.1 Metric card [O]**
- White, 1px `--border-subtle`, radius 16, padding 20, min-height 144, `display:flex; flex-direction:column; justify-content:space-between`.
- Header: category marker 18 + title 14/20 500 (gap 8); right: link 12/16 `--text-tertiary` → hover primary + underline.
- Body (row, `align-items:flex-end`): left = value `--type-metric-lg` + label row (13/20 secondary + info icon 14 `--neutral-400` with tooltip), gap 2; right = viz slot ≤ 96×48.
- Viz variants: (a) area sparkline [O Growth], (b) mini bars [O Exams], (c) multi-count — 2–4 centered columns of value 24/32 500 + dot-label [O Activity], (d) delta badge.
- Interactive card: hover border `--neutral-200`, cursor pointer, no lift. Entire card is one link/button.
- Grid: 3–4 per row, gap 12.

**9.7.2 Status tile [O]** (signature component)
- Height 72, radius 16, bg `--status-*-wash`, padding 0 16, no border, `align-items:center`, gap 12.
- Leading icon chip (40 white circle, `--shadow-sm`, glyph 16 `--status-*-glyph`).
- Text: value `--type-metric-md` (e.g. "23/24") + label 12/16 `--text-secondary`.
- Trailing: tally bars (display tile) [O] or chevron-right 16 primary (interactive tile) [O].
- Interactive hover: bg `--status-*-soft`. Selected (acts as filter): 1px ink ring.
- Layout: vertical stack gap 12, or grid row gap 12.

**9.7.3 Tinted record card [O]** (exam card pattern; generalize to any record: task, booking, ticket, shift)
- Width 200 (184–240), radius 12, bg `{hue}-200`, overflow hidden.
- **Header** (padding 8 8 6): code tile 32 + text block (title 13/20 500 primary, meta 12/16 secondary), gap 8.
- **Inner card** (margin 0 8): white, radius 10, padding 8, icon tile 32 (`{hue}-100`) + title 12/16 500 + meta 12/16 `--text-tertiary`, gap 8.
- **Footer band** (margin-top 8, height 36, padding 0 8, bg `{hue}-300`): on-tint white pills (height 22, 11/16 500, glyph `mint-600` for "Confirmed", count with glyph), gap 4; trailing ghost "···" 24.
- Hover `--shadow-sm`; selected 1px ink outline (offset 1); dragging `--shadow-md`.
- Hue = record category (§3.8).

**9.7.4 Tinted list card [O]** (rail "Upcoming" pattern)
- Full width of rail, radius 12, bg `{hue}-200` (emphasized: `{hue}-300`), padding 12, min-height 64.
- Code tile 32 + title 13/20 500 + meta 12/16 secondary ("10 Feb · 7:30am → 9:00am"); top-right on-tint pill ("4 days left"); bottom-right ghost "···". Stack gap 8.

**9.7.5 Plain content card [S]**
- White, 1px `--border-subtle`, radius 16, padding 20; header 14/20 500. Use only for detachable dashboard widgets. Prefer sections + hairlines otherwise.

### 9.8 Lists, lanes and rows

- **Board lane [O]:** bg `--surface-subtle`, radius 12, padding 12, `flex: 1 0 220px; max-width: 320px`, fills region height. Header (height 36, padding 0 4): status glyph 14 + title 14/20 500 + spacer + ink count badge. Rows gap 6.
- **Lane row [O]:** height 32, white, radius full, padding 0 10 0 6, gap 8: initials avatar 20 + name 13/20 500 (truncate) + chevron-right 14 `--neutral-400`. Hover: `--shadow-xs`, chevron → primary. Selected: 1px ink ring. Draggable rows reveal a 12px grip on hover.
- **Standard list row (on white) [S]:** height 48 (single-line) / 56 (two-line), padding 0 24, avatar 32 or icon tile 32, title 13/20 500, meta 12/16 secondary, trailing badge/time/chevron. Hover `--surface-subtle`; selected `--surface-muted`. No dividers by default; inset dividers only for multi-line rows.
- **Properties list [S]:** rows 36, label 12/16 `--text-tertiary` (width 120), value 13/20 primary; editable values show a ghost pencil 14 on hover.

### 9.9 Badges, tags and status indicators

| Component | Spec |
|---|---|
| **Status badge** [O] | Height 20, padding 0 8 0 6, radius full, bg `--status-*-soft`, glyph 10–12 `--status-*-glyph`, text 11/16 500 primary, gap 4. On tints use the on-tint variant: white bg + `--shadow-xs`. |
| **Dot-label** [O] | Height 20, padding 0 8, radius full, bg `--status-*-wash`, 6px dot `--status-*-glyph`, text 12/16 500 primary. |
| **Category tag** | Status-badge shape without glyph; bg `{hue}-100`; text primary (or `{hue}-800`). Show max 2 + "+N". |
| **Count badge** [O] | min 18×18, padding 0 5, radius full, ink, 11/18 600 white tabular. On ink surfaces: white bg, ink text. Collapsed nav: 8px ink dot. Hidden at 0; "99+" cap. |
| **Signal dot** [O] | 6px `--signal`, 2px white ring; unread/attention on icons. |
| **Delta badge** | Height 20, `success-soft` / `danger-soft`, arrow 10 in glyph color, text 11/16 500 primary tabular ("+12%"). |
| **Time pill** [O] | On-tint white pill, height 22, 11/16 500 ("4 days left"). |
| **Presence dot** | 8px on avatars, 2px surface ring; online `mint-600`, away `butter-600`, busy `coral-600`, offline `--neutral-400`. |
| **Kbd chip** [O] | §7.6. |

### 9.10 Avatars and user menu

| Size | Initials text | Use |
|---|---|---|
| 20 | 9/12 600 | Lane rows [O] |
| 24 | 10/16 600 | Table cells, assignees |
| 32 | 12/16 600 | Lists, entity header [O] |
| 40 | 14/20 500 | Sidebar account [O] |
| 56 | 18/24 500 | Profile header |

- Avatar stacks overlap −8px (32) / −6px (24) with a 2px surface-colored ring; max 4 + "+N" soft circle.
- **User menu:** popover 240 wide opening upward from the sidebar account row (or downward from a topbar avatar): header (avatar 32 + name 13/20 500 + email 12/16 tertiary), separator, items (Profile, Settings, Keyboard shortcuts with kbd hints, Theme), separator, "Sign out".

### 9.11 Data table [O]

- **Placement:** full-bleed in the panel or rail, directly below a section header. Never inside a card.
- **Header row:** height 40, 1px `--border-divider` top and bottom, text 12/16 400 `--text-tertiary`, sentence case.
- **Body rows:** height 44 (compact 36), no zebra, no row dividers; 1px divider after the last row.
- **Cells:** padding 0 16; first cell padding-left 40; last cell padding-right 40. Primary column 13/20 500 primary (may wrap to 2 lines); others 13/20 400 secondary (truncate); numeric right-aligned tabular; status column right-aligned badges [O]; date keys 13/20 500 primary ("June 9, 2024").
- **Sorting:** sortable header hover → text primary + up/down icon 12; sorted → text primary 500 + arrow 12; cycle asc → desc → none; `aria-sort`.
- **Row states:** hover `--surface-subtle`; selected `--surface-muted`; keyboard focus inset ring.
- **Selection:** checkbox column (width 40) at the content inset; header checkbox supports indeterminate. When ≥1 row is selected, a **floating ink action bar** appears bottom-center of the panel: radius 12, height 48, padding 0 8 0 16, "3 selected" 13/20 500 white + ghost-on-ink actions + close; `--shadow-lg`.
- **Row actions:** trailing ghost "···" 28, visible on hover/focus (always on touch).
- **Expandable rows:** chevron 14 in the first cell; expanded area `--surface-subtle`, padding 16 40.
- **Pagination footer [S]:** height 56, hairline top, padding 0 24; left "Showing 1–10 of 248" 12/16 `--text-tertiary` tabular; right: soft circle prev/next 32 + page chips 32 (selected ink), max 7 with ellipsis, rows-per-page ghost dropdown. Feeds use a centered "Load more" outline button instead.
- **Sticky header:** sticks under the topbar wrapper (top 72) with a white background.
- **Column widths:** primary min 240 (flex); date/time 140; numeric 96; status 140; actions 56.
- **Overflow:** horizontal scroll within the region; first column sticky with `--shadow-xs` on its right edge while scrolled.
- **Empty:** one region (height 88) with centered 13/20 `--text-tertiary` text + optional ghost action. **Loading:** 5 skeleton rows.

### 9.12 Month calendar [O]

- Region padding 16 24. Header: pager (soft circle 28 + month 16/24 500 + soft circle 28, gap 8) + right Filter; full-bleed hairline below.
- Grid: 7 columns; weekday labels two letters ("Mo", "Tu") 12/16 500 primary; day cells 44 circles, row gap 6.

| Day state | Treatment |
|---|---|
| No data | Text 13/20 400 `--text-tertiary`, bg `--neutral-25` |
| Has data / available | bg `--neutral-75`, text 13/20 500 primary |
| Selected | Ink fill, white 500 |
| Today (not selected) | 1px inset ink ring [S] |
| Out of range / blocked | Text disabled, no fill |
| Hover | bg `--neutral-100` |
| Range [S] | `--neutral-75` band between ink endpoints |

- Event dots [O]: up to 3 dots of 4px, 6px below the numeral, colored by category `-600` (ink when mixed).
- Footnote [O]: dot + soft count badge 18 + 12/16 500 label ("9 Exams this month").
- Keyboard: arrow keys move focus, Enter selects, PageUp/PageDown change month.

### 9.13 Time grid and events [O]

- **Day header:** height 28, sticky, 12/16 500 primary, centered ("1 – Mon"). Today = full-width ink block, white text, square corners.
- **Gutter:** width 64, hour labels 12/16 500 primary tabular ("08:00"), right-aligned with 12px padding, top-aligned 4px below each hour line.
- **Grid:** hour height 80 (compact 56); 1px `--border-divider` hour lines and column lines; weekend columns `--surface-subtle`.
- **Event block:** absolute, inset 2px left/right, min-height 32, radius 8, bg `{category}-200`, padding 6 10 8. Title 12/16 500 primary (13/20 when ≥ 64 tall); time 12/16 400 secondary tabular ("7:00am – 7:40am"); ghost "···" 20 top-right; on-tint status pill bottom-left when ≥ 88 tall.
- **Overlaps:** two overlapping events cascade — the later one overlaps the earlier one's lower part with `--shadow-sm` [O]; three or more split the column side by side.
- **Now indicator:** 2px ink line across today's column (other days optional 1px ink at 24% opacity) + time pill in the gutter (ink, height 22, padding 0 8, 11/16 600 white tabular); updates each minute.
- **Interactions:** click empty slot → create popover prefilled with time; drag to move (15-minute snap); bottom 6px handle to resize; keyboard: arrows move focus between events, Enter opens.

### 9.14 Tooltips, popovers and context menus

- **Tooltip [O-derived]:** ink bg, white 12/16 500, padding 6 10, radius 8, max-width 240, no arrow, offset 6; delay 400ms in, 0ms out; shortcuts shown in `--on-ink-muted`. Never contains interactive content.
- **Popover:** white, 1px `--border-subtle`, radius 12, `--shadow-md`, padding 12 (content) or 4 (menus), width 280–360; optional title 14/20 500 + ghost close 28.
- **Context menu:** "···" ghost trigger (24/28) or right-click on rows/events; menu spec §9.4.
- **Positioning:** prefer bottom-start; flip to top when < 240px below; shift to stay 12px inside the viewport; width ≥ trigger width.

### 9.15 Modals, drawers, confirmations, command palette

- **Modal:** scrim `--scrim` (no blur); dialog white, radius 16, `--shadow-lg`; widths 400/560/720; header padding 20 24 0 with title 16/24 500 + optional description 13/20 secondary; ghost close 32 at 16px from top-right; body padding 16 24 (scrolls); footer padding 16 24 24, right-aligned buttons (md 32).
- **Drawer [S]:** floating inset 12px from top/right/bottom, radius 16, `--shadow-lg`, widths 400/560/720; header 60 (padding 0 16 0 24, title 16/24 500, actions, close) + hairline; body padding 24; sticky footer 64 with hairline. Inspect drawers (non-modal) use no scrim and leave the page interactive.
- **Confirmation dialog:** width 400; icon chip 40 (destructive: `coral-100` + `coral-600` glyph; neutral: `--surface-muted`); title as a question naming the object ("Delete 3 assignments?"); body states the consequence; footer "Cancel" outline + confirm button repeating the verb ("Delete") — danger for destructive, ink otherwise. Initial focus on Cancel for destructive. Irreversible high-impact actions require typing the object name.
- **Command palette [S]:** opened by ⌘K or the topbar search; width 640, radius 16, `--shadow-lg`; input 56 tall without border (16/24, search icon 18); hairline; grouped results (labels 12/16 tertiary), items 40 tall radius 8 with icon + label + kbd/meta; active item `--neutral-75`; footer hint row 12/16 tertiary.

### 9.16 Toasts and inline feedback

- **Toast [S]:** ink bg, radius 12, padding 12 16, `--shadow-lg`, max-width 380; glyph 16 in `--status-*-fill` (400 — legible on black); title 13/20 500 white; optional body 12/16 `--on-ink-muted`; optional action (white 13/20 500, underline on hover) and close × 14. Stack max 3, gap 8. Duration 4s; 6s with action; errors persist until dismissed. Pause on hover/focus. `role="status"` (errors `role="alert"`).
- **Inline alert [S]:** radius 12, bg `--status-*-wash`, padding 12 16, glyph 16 `--status-*-glyph`, title 13/20 500 primary, body 13/20 secondary, link actions, optional ghost dismiss 24. Spans the content width at the content inset.
- **In-place success:** a button may briefly read "Saved ✓" for 2s instead of a toast.
- **Form error summary:** danger inline alert at the form top listing invalid fields as anchor links (when > 3 errors).

### 9.17 Progress, loading and skeletons

- **Progress bar:** height 6 (compact 4), radius full, track `--neutral-100`, fill ink (or status glyph color when it represents status); label 12/16 secondary + tabular value right.
- **Tally bars [O, signature]:** two rows of N bars (N ≤ 24); bar 3×16, radius 1.5, horizontal gap 2, row gap 4; inactive `--neutral-200`; active `--status-*-fill` (or `-glyph` for emphasis). `role="img"` + `aria-label="23 of 24 present"`.
- **Ring progress:** 16–40, stroke 3 (≤24) / 4, track `--neutral-100`, indicator ink or status glyph, round caps; value inside at ≥32.
- **Spinner:** 14/16/20, 2px stroke, 25% track, 800ms linear; white on ink.
- **Skeleton:** `--neutral-75` blocks with a 1.4s shimmer (`--neutral-75 → --neutral-100 → --neutral-75`); shapes mirror content (text bars 10–12 tall radius 4, circles for avatars, real radii for cards). Show after 150ms; keep at least 300ms. Never skeleton the shell or sidebar.

### 9.18 Empty, error and success state blocks

One component, the **state block**: icon chip + title + description + actions, centered.

| Variant | Icon chip | Title example | Action |
|---|---|---|---|
| Empty (first run) | Soft chip `--surface-muted`, glyph `--neutral-800` | "No students yet" | Primary: "Add student" |
| No results | Soft chip, search glyph | "No matches for "algebra"" | Ghost: "Clear filters" |
| Error | `coral-100` chip, `coral-600` glyph | "Couldn't load exams" | Outline: "Try again" |
| Success | `mint-100` chip, `mint-600` check | "All assignments checked" | Ghost: next step |
| No permission | Soft chip, lock glyph | "You don't have access" | Outline: "Request access" |

Sizes: page (chip 48, title 16/24) or region (chip 40, title 14/20). Quiet inline empty rows use text only [O].

---

## 10. Interaction states and behavior

### 10.1 Motion tokens [S]

| Token | Value | Use |
|---|---|---|
| `--duration-instant` | 80ms | Press feedback, label fade before sidebar collapse |
| `--duration-fast` | 120ms | Hover color changes, chip toggles, checkbox |
| `--duration-base` | 180ms | Popovers, menus, tooltips, accordions, scrim |
| `--duration-layout` | 220ms | Sidebar width, sliding selection pills/thumbs |
| `--duration-slow` | 240ms | Modals, drawers, toasts |
| `--ease-standard` | `cubic-bezier(0.2, 0, 0, 1)` | Most transitions |
| `--ease-enter` | `cubic-bezier(0, 0, 0, 1)` | Elements appearing |
| `--ease-exit` | `cubic-bezier(0.4, 0, 1, 1)` | Elements leaving (use ~70% of enter duration) |

Motion only answers user actions or shows what changed. No entrance animations on page load, no hover lifts on cards, no parallax, no bouncing.

### 10.2 Global state recipes

| State | Rule |
|---|---|
| **Hover** | Move the surface one step: transparent → `--action-ghost-hover`; `--neutral-75` → `--neutral-100`; white → `--neutral-50`; wash (50) → soft (100); ink → `--ink-hover`. Text secondary → primary. No movement, no scale, no new shadows (exceptions: draggable lane rows and record cards get `--shadow-xs` / `--shadow-sm`). |
| **Pressed** | One more step (`--neutral-150`, ghost 6%, `--ink-pressed`). No scale transforms. |
| **Focus-visible** | `--focus-ring` (2px gap in the surface color + 2px ink), following the element's radius. Inputs use ink border + soft halo. Never remove outlines without this replacement. |
| **Selected — compact controls** (chips, tabs, segments on white, dates, pager items, today header) | On white: ink fill + white text. On gray/tinted: white fill + `--shadow-xs`. |
| **Selected — large areas** (table rows, list rows, vertical secondary nav, cards) | `--surface-muted` fill (rows, vertical nav) or 1px ink ring (cards, lane rows). Never fill a large area with ink. |
| **Disabled** | Explicit tokens (`--text-disabled`, `--neutral-75` fills); never reduce opacity on tinted components; `cursor:not-allowed`; explain via tooltip when possible. |
| **Loading** | Inline spinner, `aria-busy`, layout locked, duplicate submissions blocked. |
| **Error** | Coral border/glyph + text message. Never color alone. |

### 10.3 Behavior specifications

**Sidebar expand/collapse.** Toggle button in the sidebar header and shortcut `⌘\` (Ctrl+\ on Windows). State persists per user. Width animates over `--duration-layout`; labels fade out first (80ms) and in last. Collapsed items show ink tooltips. Auto-collapse below 1280px; manual expand then overlays the panel (floating, `--shadow-lg`) instead of pushing it.

**Dropdowns and popovers.** Open on click (never hover). Enter: opacity 0→1, translateY(−4px→0), scale 0.98→1 from the trigger side, 180ms `--ease-enter`. Close on Esc (focus returns to trigger), outside click, or selection (single-select). Positioned per §9.14.

**Modals.** Scrim fades 180ms; dialog opacity + scale 0.98→1 + translateY(8px→0) over 240ms. Focus is trapped; first focusable (or Cancel for destructive) receives focus; Esc closes unless there are unsaved changes (then confirm). Background scroll locked. Focus returns to the trigger.

**Drawers.** translateX(24px→0) + opacity, 240ms. Modal drawers trap focus; inspect drawers don't. Opening a different record swaps content in place without re-animating.

**Tables.** Clicking a row opens its detail (drawer or page); clicking checkboxes, links or action buttons inside the row does not. Shift-click selects ranges. Filtering applies immediately with skeleton rows if the response takes > 300ms, updates the Filter count badge, and announces the result count politely. Selection persists across pages with a "Select all 248" link in the action bar. Page changes scroll the table's top into view.

**Forms.** Validate a field on blur; after its first error, re-validate on each change. On submit validate all, focus the first invalid field, and show a summary for > 3 errors. Never clear user input on error. Disable the submit button only while submitting. Warn on navigation with unsaved changes.

**Loading transitions.** First load: skeletons. Refresh: keep stale content visible, show the 2px topbar progress line or a button spinner. Toggles and simple edits are optimistic with rollback + error toast on failure.

**Empty and failed data.** Use state blocks (§9.18). If a refresh fails but cached data exists, keep the data and show an inline warning alert with "Try again".

**Destructive actions.** Prefer *undo* for reversible actions (archive, remove from list): perform immediately + 6s toast with "Undo". Use a confirmation dialog for irreversible actions. Bulk destructive labels include the count ("Delete 12 records"). Destructive buttons are never the default focus.

**Drag and drop.** Lifted item gets `--shadow-md`; its origin shows a 1px dashed `--neutral-300` placeholder with the same radius; valid drop zones tint to `--neutral-75`. Keyboard alternative: Space to pick up, arrows to move, Space to drop, Esc to cancel, plus a "Move to…" menu item.

**Selection pills.** The active nav pill and segmented thumb may slide between positions (220ms). This is the only "flourish" motion in the system.

**Reduced motion.** Under `prefers-reduced-motion: reduce`: replace transforms with ≤120ms opacity fades, disable shimmer (static skeleton), disable sliding pills, and make the sidebar snap.

---

## 11. Responsive design

### 11.1 Breakpoints

| Name | Range | Token (for media queries) |
|---|---|---|
| xs | < 480 | — |
| sm | 480–767 | `--bp-sm: 480px` |
| md | 768–1023 | `--bp-md: 768px` |
| lg | 1024–1279 | `--bp-lg: 1024px` |
| xl | 1280–1535 | `--bp-xl: 1280px` |
| 2xl | ≥ 1536 | `--bp-2xl: 1536px` |

### 11.2 Shell transformations

| Range | Shell gutter | Sidebar | Panel | Content inset | Topbar | Rail |
|---|---|---|---|---|---|---|
| ≥ 1280 | 12 | Expanded 272 | Radius 16 | 24 | Inset bar 60 | Inline 360 |
| 1024–1279 | 12 | Collapsed 72 (expand overlays) | Radius 16 | 24 | Inset bar 60 | Inline 320, or below main if main < 640 |
| 768–1023 | 8 | Hidden → off-canvas drawer (left, inset 8, radius 16, width 288, shell gradient) | Radius 16 | 20 | Inset bar 56 + menu button before breadcrumb | Below main, full width, hairline above |
| < 768 | 0 | Drawer (full height, width 85vw max 320); optional bottom tab bar | Full screen, radius 0 | 16 | Non-inset bar 56, sticky, hairline bottom | Below main |

**Mobile topbar (< 768):** [menu icon button] [page title 16/24 500, truncated] [spacer] [≤ 2 icon buttons]. Breadcrumbs are hidden; detail pages show a back chevron. Page title in the content area becomes 20/28 (or is omitted when the topbar shows it).

**Bottom tab bar (optional, ≤ 5 destinations):** height 56 + safe-area inset, white, hairline top; items = icon 20 + label 11/16 500 `--text-secondary`; active item = ink pill 40×28 behind a white icon + label in primary.

### 11.3 Content transformations

| Pattern | Transformation |
|---|---|
| Metric cards | 4 → 2 (md) → 1 (xs), min width 240 |
| Status tiles | 4 → 2 → 1; tally bars hide below 360px tile width |
| Split rail | Rail drops below main (md and down) |
| Lead column + board | Lead column stacks above; lanes become a horizontal scroll-snap row (lane width 85vw) or switch to a segmented control showing one lane at a time |
| Record cards | Wrap; on xs they become full-width tinted list cards |
| Month calendar | Day cells 36; footnote stays |
| Time grid | Week view only ≥ 1024; 768–1023 shows 3 days; < 768 shows day view with a row of 7 day chips (selected ink) and swipe between days |
| Tables | ≤ 4 essential columns → stacked list rows (primary 14/20 500, two "label value" pairs 12/16, status badge top-right, hairlines inset 16). More columns or comparison-critical data → horizontal scroll with sticky first column |
| Forms | Single column; two-column settings rows stack (description above controls); inputs use 16px text; primary actions move to a sticky bottom bar (64 + safe area) with a full-width 40 ink button |
| Modals | < 768 → bottom sheet: full width, top radius 24, max-height 90dvh, 36×4 grab handle, sticky footer with safe-area padding; large modals become full-screen |
| Drawers | < 768 → full-screen sheet |
| Menus | > 6 items on < 768 → bottom sheet list |
| Page header actions | Secondary actions collapse into "···"; primary moves to the bottom bar or stays as a 32 icon button |

### 11.4 Touch rules

- Minimum hit area 44×44; 32px visual controls extend their hit area with padding or a pseudo-element.
- Adjacent targets ≥ 8px apart.
- Under `@media (hover: none)`: always show row actions, drag handles and "···" buttons; tooltips become long-press hints.
- Swipe actions on list rows are optional; they must duplicate actions available in the row menu.

### 11.5 Wide screens (≥ 1536)

The panel grows; content does not stretch indefinitely: forms cap at 720, settings at 960, reading at 72ch. Dashboards may add a 4th metric column and widen the rail to 400. Never increase type size for wide screens.

---

## 12. Accessibility requirements

Target: **WCAG 2.2 AA**.

- **Contrast:** follow §3.9. Text ≥ 4.5:1 (≥ 3:1 for 24px titles), UI glyphs and chart strokes ≥ 3:1. Verify text on every tint it can appear on.
- **Focus:** visible `--focus-ring` on all interactive elements; logical DOM order matching visual order; a "Skip to content" link appears as an ink pill at the panel's top-left when focused.
- **Landmarks:** sidebar `<nav aria-label="Main">`; topbar `<header>`; panel content `<main>`; rail `<aside>`; breadcrumb `<nav aria-label="Breadcrumb">` with `aria-current="page"`.
- **Selection semantics:** nav uses `aria-current="page"`; content-switching chips use `role="tablist"`/`tab`; filtering single-select chips use `role="radiogroup"`; multi-select chips use `aria-pressed`; segmented controls use a radiogroup; calendars use `role="grid"` with `aria-selected` and roving tabindex.
- **Never color alone:** statuses pair hue + glyph + text; categories show their name in text somewhere (tooltip at minimum); charts use direct labels or a table alternative.
- **Names:** icon-only buttons have `aria-label`; decorative icons are `aria-hidden`; count badges are included in names ("Messages, 2 unread"); kbd chips are `aria-hidden` with `aria-keyshortcuts` on the target.
- **Data glyphs:** tally bars, sparklines and mini charts use `role="img"` with a summary `aria-label`.
- **Forms:** visible labels (never placeholder-only); `aria-describedby` for helper and error text; `aria-invalid`; required fields marked in text.
- **Live regions:** toasts `role="status"` (errors `role="alert"`); result counts after filtering announced politely.
- **Keyboard:** everything operable by keyboard; Esc closes overlays; modal focus trap and focus return; single-key shortcuts need a modifier or must be remappable (2.1.4).
- **Target size:** ≥ 24×24 on desktop (2.5.8), 44×44 on touch.
- **Reflow and zoom:** usable at 320px width and 400% zoom; no fixed heights on text containers (controls excepted); truncated text is reachable via tooltip/title.
- **Motion:** honor `prefers-reduced-motion` (§10.3).
- **Localization:** dates, times, numbers and currencies via `Intl`; layouts tolerate +30% text length; RTL mirrors the shell (sidebar right) and directional icons.

---

## 13. Data visualization guidelines

### 13.1 Principles

- Charts are small, embedded and quiet. They support a number; they rarely *are* the page.
- Hue follows the same meaning rules as the UI (status or category). **Ink marks "now", "selected" or "current".**
- No 3D, no drop shadows, no decorative gradients (only the area fill gradient), no chart junk, no rainbow scales.
- Prefer direct labels over legends; prefer bars over pies.

### 13.2 Containers

| Container | Spec |
|---|---|
| **Viz slot in metric card** [O] | ≤ 96×48, no axes, no labels, no tooltip unless hovered |
| **Chart card** | Plain content card (r16, border, padding 20); header 14/20 500 + right controls (segmented sm or ghost dropdown "Last 30 days ⌄"); chart height 200–320 |
| **Chart region** | Inside a divided section without a card (analytics pages); padding 24; height 280–400 |

### 13.3 Color assignment

| Situation | Colors |
|---|---|
| Single series | `--ambient-fill` (400) area / `--ambient-glyph` (600) stroke |
| Multiple series | Categorical order (§3.8): `-600` for strokes, `-400` for fills |
| Status series | Status family (success = mint, etc.) |
| Previous period / benchmark | `--neutral-300`, 1.5px dashed |
| Current / selected / now | Ink |
| De-emphasized bars | `--neutral-200` [O mini bars] |

### 13.4 Chart specs

- **Sparkline area [O]:** no axes; straight segments; fill `linear-gradient(to bottom, {hue}-400 @ 80%, {hue}-100 @ 0%)`; optional 1.5px `{hue}-600` top stroke; optional 4px ink dot on the last point.
- **Mini bars [O]:** bar width 4, gap 6, radius full; highlighted bars `{hue}-400` (or `-600` for the current one), others `--neutral-200`.
- **Bar chart:** bar width 8–24 (never wider), gap ≥ 40% of bar width, top radius 4 (full radius when ≤ 8 wide); value labels 11/16 secondary above bars when ≤ 12 bars.
- **Line chart:** 2px stroke, round joins and caps; no points except on hover (6px white dot with 2px series stroke) and the last value; optional area fill at 50% of the sparkline gradient.
- **Axes:** labels 11/16 `--text-tertiary` tabular; horizontal gridlines only, 1px `--border-divider`, 4–5 ticks; baseline 1px `--neutral-200`; no vertical gridlines; units in the axis title, not on every tick.
- **Tooltip:** ink tooltip (radius 8, padding 8 10): heading 12/16 500 white; rows = 8px series dot + label `--on-ink-muted` + value white tabular right-aligned; vertical crosshair 1px dashed `--neutral-300`.
- **Donut / ring:** thickness 10% of diameter (min 6), 2px white gaps between segments, ≤ 5 segments, center value `--type-metric-md`. Use only for part-to-whole with ≤ 5 parts.
- **Stacked bars:** ≤ 4 segments, 1px white separators.
- **Heatmap / calendar heatmap:** cells radius 4, 4 intensity levels using `{hue}-100 / 200 / 400 / 600`, zero = `--neutral-75`.
- **Tally bars, dot-labels, event dots:** §9.17, §9.9, §9.12.
- **Legend:** inline above the chart, right-aligned: 8px round dots + 12/16 secondary labels; items toggle series (`aria-pressed`).
- **Numbers:** abbreviate (12.4k), percentages with 0–1 decimals, consistent units, tabular figures.

### 13.5 Chart states

- Loading: skeleton block with the container's radius and shimmer.
- Empty: "No data for this period." 13/20 `--text-tertiary` centered + ghost "Change range".
- Error: inline danger alert inside the container with "Try again".

### 13.6 Chart accessibility

`role="img"` with a one-sentence summary ("Attendance rose 10% over 6 weeks"); a "View as table" toggle for analytical charts; series distinguishable by label or dash pattern, not only hue.

---

## 14. Do's and don'ts

| Do | Don't |
|---|---|
| Inset a white panel 12px into a tinted shell | Use a dark or colored sidebar, or a full-width white app with a bordered sidebar |
| Make primary buttons and compact selections ink black | Introduce a blue/purple "brand primary" button |
| Use pastel washes with white chips to show status | Use saturated full-color backgrounds or colored text for status |
| Pair every status hue with a glyph and a label | Rely on color alone |
| Separate regions with full-bleed hairlines | Wrap every region in a bordered card |
| Keep tables, calendars and time grids full-bleed | Put tables inside cards with extra padding |
| Use 500 for titles and 400 for body | Use bold 700 or ALL-CAPS labels |
| Keep page titles at 24px | Create hero-sized headings inside the app |
| Use pills for actions, rects for containers, circles for dates/avatars | Mix square buttons, pill inputs and random radii |
| Step radii down when nesting (16 → 12 → 10 → 8) | Use one radius for everything |
| Use `--shadow-xs/sm` only for white chips on tints | Add soft gray shadows under every card |
| Show white "selected" pills on gray surfaces | Put ink pills on the gray shell (except count badges) |
| Choose one ambient hue per product | Change the shell tint arbitrarily per page |
| Use quiet inline empties ("No exams.") | Use jokes, illustrations or emoji in empty states |
| Align all text-leading blocks at 24px | Let page titles, sections and cards start at different x positions |
| Use the token scale for every value | Use one-off values (14px gaps, 18px radii, custom grays) |
| Use tally bars, small sparklines and dot-labels to add data texture | Add large decorative charts with gradients and glows |
| Keep motion functional and short | Animate page entrances, hover-lift cards, or bounce elements |
| Reuse patterns that fit the product | Copy the reference's school-specific structure (classes, exams) when it doesn't fit |

---

## 15. Implementation guidance and token definitions

### 15.1 Complete token file (`tokens.css`)

Paste this file unchanged into every product. Product-specific values live only in the **Product layer** block at the end.

```css
:root {
  /* ───────── Primitives: neutrals ───────── */
  --neutral-0:   #FFFFFF;  --neutral-25:  #FCFCFC;  --neutral-50:  #FAFAFA;
  --neutral-75:  #F5F5F5;  --neutral-100: #F0F0F0;  --neutral-150: #EBEBEB;
  --neutral-200: #E3E3E3;  --neutral-300: #D4D4D4;  --neutral-400: #A3A3A3;
  --neutral-500: #8A8A8A;  --neutral-600: #737373;  --neutral-700: #616161;
  --neutral-800: #2E2E2E;  --neutral-900: #171717;  --neutral-950: #0A0A0A;
  --black: #000000;

  /* ───────── Primitives: ink ───────── */
  --ink: #000000;  --ink-hover: #262626;  --ink-pressed: #0F0F0F;
  --on-ink: #FFFFFF;  --on-ink-muted: rgba(255,255,255,0.64);
  --signal: #F08A3C;            /* 6px attention dots only */
  --danger-solid: #B5452F;      /* danger buttons only (5.4:1 with white) */

  /* ───────── Primitives: pastel families (50 wash · 100 soft · 200 tint · 300 band · 400 fill · 600 glyph · 800 ink) ───────── */
  --violet-50:#F8F6FF; --violet-100:#F0ECFE; --violet-200:#E6DFFC; --violet-300:#D3C8F7; --violet-400:#A894EE; --violet-600:#6C4FD6; --violet-800:#3F2A8C;
  --indigo-50:#F5F6FE; --indigo-100:#E9ECFD; --indigo-200:#D2D7FA; --indigo-300:#BAC0E6; --indigo-400:#9AA3EC; --indigo-600:#4F5BD0; --indigo-800:#28307A;
  --sky-50:#F3FAFE;    --sky-100:#E8F5FD;    --sky-200:#DCEFFC;    --sky-300:#C4E1F4;    --sky-400:#84C2EE;    --sky-600:#2E8FD6;    --sky-800:#145079;
  --mint-50:#F4FBF8;   --mint-100:#E6F8EF;   --mint-200:#D4F5E3;   --mint-300:#C2E5D3;   --mint-400:#7CCBAE;   --mint-600:#278F6B;   --mint-800:#14553E;
  --butter-50:#FFFBF2; --butter-100:#FEF5DF; --butter-200:#FCEDCC; --butter-300:#EBDDBD; --butter-400:#EBC468; --butter-600:#B9800F; --butter-800:#6E4C07;
  --coral-50:#FEF6F4;  --coral-100:#FCEAE5;  --coral-200:#F8D9D0;  --coral-300:#E6C5BC;  --coral-400:#EC9C8A;  --coral-600:#C9563F;  --coral-800:#7A2A1C;
  --copper-50:#FDF8F4; --copper-100:#FBEEE5; --copper-200:#F6DECF; --copper-300:#E7CBB8; --copper-400:#D69A73; --copper-600:#A85E31; --copper-800:#6A3517;

  /* ───────── Semantic: surfaces ───────── */
  --surface-panel:   var(--neutral-0);
  --surface-raised:  var(--neutral-0);
  --surface-subtle:  var(--neutral-50);
  --surface-muted:   var(--neutral-75);
  --surface-inverse: var(--ink);
  --surface-overlay: var(--neutral-0);
  --scrim: rgba(10,10,10,0.32);
  --surface-shell:
    radial-gradient(140% 70% at 0% 0%, var(--shell-tint) 0%, rgba(245,245,245,0) 70%),
    linear-gradient(180deg, #EEEEEE 0%, #F5F5F5 55%, #F7F7F7 100%);

  /* ───────── Semantic: text ───────── */
  --text-primary:   var(--neutral-950);
  --text-secondary: var(--neutral-700);
  --text-tertiary:  var(--neutral-600);   /* white & subtle surfaces only */
  --text-disabled:  var(--neutral-400);
  --text-inverse:   var(--on-ink);

  /* ───────── Semantic: borders ───────── */
  --border-divider: var(--neutral-100);
  --border-subtle:  var(--neutral-150);
  --border-control: var(--neutral-300);
  --border-strong:  var(--ink);

  /* ───────── Semantic: interactive ───────── */
  --action-primary:         var(--ink);
  --action-primary-hover:   var(--ink-hover);
  --action-soft:            var(--neutral-75);
  --action-soft-hover:      var(--neutral-100);
  --action-soft-pressed:    var(--neutral-150);
  --action-ghost-hover:     rgba(10,10,10,0.04);
  --action-ghost-pressed:   rgba(10,10,10,0.06);
  --focus-gap: var(--surface-panel);
  --focus-ring: 0 0 0 2px var(--focus-gap), 0 0 0 4px var(--ink);
  --input-halo: 0 0 0 3px rgba(10,10,10,0.08);
  --input-halo-error: 0 0 0 3px rgba(201,86,63,0.15);

  /* ───────── Semantic: status (wash · soft · tint · band · fill · glyph · ink) ───────── */
  --status-success-wash:var(--mint-50);   --status-success-soft:var(--mint-100);   --status-success-tint:var(--mint-200);   --status-success-band:var(--mint-300);   --status-success-fill:var(--mint-400);   --status-success-glyph:var(--mint-600);   --status-success-ink:var(--mint-800);
  --status-pending-wash:var(--violet-50); --status-pending-soft:var(--violet-100); --status-pending-tint:var(--violet-200); --status-pending-band:var(--violet-300); --status-pending-fill:var(--violet-400); --status-pending-glyph:var(--violet-600); --status-pending-ink:var(--violet-800);
  --status-warning-wash:var(--butter-50); --status-warning-soft:var(--butter-100); --status-warning-tint:var(--butter-200); --status-warning-band:var(--butter-300); --status-warning-fill:var(--butter-400); --status-warning-glyph:var(--butter-600); --status-warning-ink:var(--butter-800);
  --status-caution-wash:var(--copper-50); --status-caution-soft:var(--copper-100); --status-caution-tint:var(--copper-200); --status-caution-band:var(--copper-300); --status-caution-fill:var(--copper-400); --status-caution-glyph:var(--copper-600); --status-caution-ink:var(--copper-800);
  --status-danger-wash:var(--coral-50);   --status-danger-soft:var(--coral-100);   --status-danger-tint:var(--coral-200);   --status-danger-band:var(--coral-300);   --status-danger-fill:var(--coral-400);   --status-danger-glyph:var(--coral-600);   --status-danger-ink:var(--coral-800);
  --status-info-wash:var(--sky-50);       --status-info-soft:var(--sky-100);       --status-info-tint:var(--sky-200);       --status-info-band:var(--sky-300);       --status-info-fill:var(--sky-400);       --status-info-glyph:var(--sky-600);       --status-info-ink:var(--sky-800);
  --status-neutral-wash:var(--neutral-50);--status-neutral-soft:var(--neutral-75);--status-neutral-tint:var(--neutral-100);--status-neutral-band:var(--neutral-150);--status-neutral-fill:var(--neutral-300);--status-neutral-glyph:var(--neutral-600);--status-neutral-ink:var(--neutral-800);

  /* ───────── Typography ───────── */
  --font-sans: "Inter", "Inter Variable", -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --font-mono: "JetBrains Mono", "SF Mono", ui-monospace, Menlo, Consolas, monospace;
  --weight-regular: 400;  --weight-medium: 500;  --weight-semibold: 600;
  /* size / line-height pairs */
  --fs-display: 32px;  --lh-display: 40px;  --ls-display: -0.02em;
  --fs-title-lg: 24px; --lh-title-lg: 32px; --ls-title-lg: -0.015em;
  --fs-title-md: 16px; --lh-title-md: 24px; --ls-title-md: -0.005em;
  --fs-title-sm: 14px; --lh-title-sm: 20px;
  --fs-body: 14px;     --lh-body: 20px;
  --fs-body-sm: 13px;  --lh-body-sm: 20px;
  --fs-label: 12px;    --lh-label: 16px;
  --fs-caption: 12px;  --lh-caption: 16px;
  --fs-micro: 11px;    --lh-micro: 16px;

  /* ───────── Spacing ───────── */
  --space-0-5: 2px;  --space-1: 4px;  --space-1-5: 6px;  --space-2: 8px;  --space-2-5: 10px;
  --space-3: 12px;   --space-4: 16px; --space-5: 20px;   --space-6: 24px; --space-8: 32px;
  --space-10: 40px;  --space-12: 48px; --space-16: 64px;

  /* ───────── Layout ───────── */
  --shell-gutter: 12px;
  --sidebar-w: 272px;  --sidebar-w-collapsed: 72px;
  --sidebar-pad: 24px 20px 20px 20px;
  --topbar-h: 60px;  --topbar-inset: 12px;
  --content-inset: 24px;
  --rail-w: 360px;
  --grid-gap: 12px;  --gap-tight: 8px;  --section-gap: 24px;
  --form-max: 720px;  --settings-max: 960px;  --reading-max: 72ch;

  /* ───────── Controls ───────── */
  --control-xs: 24px; --control-sm: 28px; --control-md: 32px; --control-lg: 40px; --control-xl: 48px;
  --row-h: 44px;  --row-h-header: 40px;  --section-header-h: 56px;
  --nav-item-h: 32px;  --nav-item-gap: 8px;
  --cal-day: 44px;  --hour-h: 80px;

  /* ───────── Radii ───────── */
  --radius-2xs: 4px;  --radius-xs: 6px;  --radius-sm: 8px;  --radius-md: 10px;
  --radius-lg: 12px;  --radius-xl: 16px; --radius-2xl: 24px; --radius-full: 9999px;

  /* ───────── Shadows ───────── */
  --shadow-xs:  0 1px 2px rgba(10,10,10,0.05);
  --shadow-sm:  0 1px 2px rgba(10,10,10,0.04), 0 2px 8px rgba(10,10,10,0.05);
  --shadow-ink: 0 2px 6px rgba(0,0,0,0.16);
  --shadow-md:  0 1px 3px rgba(10,10,10,0.05), 0 8px 24px rgba(10,10,10,0.08);
  --shadow-lg:  0 2px 6px rgba(10,10,10,0.05), 0 24px 48px rgba(10,10,10,0.12);

  /* ───────── Motion ───────── */
  --duration-instant: 80ms;  --duration-fast: 120ms;  --duration-base: 180ms;
  --duration-layout: 220ms;  --duration-slow: 240ms;
  --ease-standard: cubic-bezier(0.2, 0, 0, 1);
  --ease-enter: cubic-bezier(0, 0, 0, 1);
  --ease-exit: cubic-bezier(0.4, 0, 1, 1);

  /* ───────── Z-index ───────── */
  --z-base: 0;  --z-sticky: 10;  --z-sidebar-overlay: 30;  --z-drawer: 40;
  --z-modal: 50;  --z-popover: 60;  --z-toast: 70;  --z-tooltip: 80;

  /* ═════════ Product layer (Layer C) — the ONLY block a product edits ═════════ */
  --shell-tint:    #E2E6E9;            /* ambient preset, §3.7 */
  --ambient-fill:  var(--indigo-400);
  --ambient-glyph: var(--indigo-600);
}

/* Density */
[data-density="compact"] {
  --nav-item-gap: 2px;  --row-h: 36px;  --row-h-header: 32px;  --section-header-h: 48px;
  --cal-day: 36px;  --hour-h: 56px;
}

/* Responsive layout tokens (breakpoints: 480 / 768 / 1024 / 1280 / 1536) */
@media (max-width: 1023px) { :root { --shell-gutter: 8px; --content-inset: 20px; --topbar-h: 56px; } }
@media (max-width: 767px)  { :root { --shell-gutter: 0px; --content-inset: 16px; --topbar-h: 56px;
                                      --fs-title-lg: 20px; --lh-title-lg: 28px; --fs-display: 28px; --lh-display: 36px; } }

/* Motion safety */
@media (prefers-reduced-motion: reduce) {
  :root { --duration-layout: 0ms; --duration-slow: 120ms; --duration-base: 120ms; }
}
```

### 15.2 Token usage rules

1. **Three tiers:** primitives (`--mint-200`) → semantic (`--status-success-tint`, `--surface-muted`) → component (`--btn-primary-bg`, optional). Components read semantic tokens. Primitives are read directly only for categorical color (`--{hue}-200` chosen from data).
2. **No raw values in components.** No hex codes, no px outside the scales. A missing value means a missing token: add it to the token file with a reason, never inline.
3. **Reuse before inventing.** Before creating a new component style, check whether a variant in §9 covers it (on-tint pill, soft chip, status tile, record card).
4. **Theming a product** = editing only the Product layer (`--shell-tint`, `--ambient-*`) plus logomark, nav and copy.
5. **Adding a status** = map it to an existing semantic family. Only add a new semantic if it cannot share a family with an existing status in the same view.
6. **Categorical color** = a data-driven key (`category.hue = "indigo"`) resolved to `var(--indigo-200)` etc. at render time.
7. **Focus gap** must be set to the surface behind the element: `--focus-gap: transparent` is forbidden; on the shell set it to `#F5F5F5`.

### 15.3 Reference CSS for core primitives

```css
/* Base */
html { font-family: var(--font-sans); font-size: 14px; color: var(--text-primary);
       -webkit-font-smoothing: antialiased; }
.tnum { font-variant-numeric: tabular-nums; }
:focus-visible { outline: none; box-shadow: var(--focus-ring); }

/* Topbar */
.topbar-wrap { position: sticky; top: 0; z-index: var(--z-sticky);
               padding: var(--topbar-inset) var(--topbar-inset) 0; background: var(--surface-panel); }
.topbar { height: var(--topbar-h); border: 1px solid var(--border-subtle); border-radius: var(--radius-lg);
          display: flex; align-items: center; justify-content: space-between; padding: 0 10px 0 16px; }

/* Page header */
.page-header { padding: 28px var(--content-inset) 24px; display: flex; align-items: center; gap: 16px;
               border-bottom: 1px solid var(--border-divider); }
.page-title { font: var(--weight-medium) var(--fs-title-lg)/var(--lh-title-lg) var(--font-sans);
              letter-spacing: var(--ls-title-lg); margin: 0; }
.page-desc  { font-size: var(--fs-body-sm); line-height: var(--lh-body-sm); color: var(--text-secondary); margin: 4px 0 0; }

/* Nav item */
.nav-item { height: var(--nav-item-h); padding: 0 12px; gap: 10px; border-radius: var(--radius-full);
            display: flex; align-items: center; font: var(--weight-medium) 14px/20px var(--font-sans);
            color: var(--text-primary); transition: background var(--duration-fast) var(--ease-standard); }
.nav-item:hover { background: var(--action-ghost-hover); }
.nav-item[aria-current="page"] { background: var(--neutral-0); box-shadow: var(--shadow-xs); }
.sidebar { --focus-gap: #F5F5F5; }

/* Buttons */
.btn { height: var(--control-md); padding: 0 14px; gap: 6px; border-radius: var(--radius-full);
       display: inline-flex; align-items: center; font: var(--weight-medium) 13px/20px var(--font-sans);
       border: 1px solid transparent; transition: background var(--duration-fast) var(--ease-standard),
       border-color var(--duration-fast) var(--ease-standard); }
.btn-primary { background: var(--action-primary); color: var(--on-ink); }
.btn-primary:hover { background: var(--action-primary-hover); }
.btn-outline { background: var(--neutral-0); border-color: var(--border-subtle); color: var(--text-primary); }
.btn-outline:hover { background: var(--neutral-50); border-color: var(--neutral-200); }
.btn-soft { background: var(--action-soft); color: var(--text-primary); }
.btn-soft:hover { background: var(--action-soft-hover); }
.btn-ghost { background: transparent; color: var(--text-secondary); }
.btn-ghost:hover { background: var(--action-ghost-hover); color: var(--text-primary); }
.btn-on-tint { background: var(--neutral-0); color: var(--text-primary); box-shadow: var(--shadow-xs); }

/* Count badge */
.count { min-width: 18px; height: 18px; padding: 0 5px; border-radius: var(--radius-full);
         background: var(--ink); color: var(--on-ink); font: 600 11px/18px var(--font-sans);
         font-variant-numeric: tabular-nums; text-align: center; }

/* Chip */
.chip { height: var(--control-md); padding: 0 14px; gap: 6px; border-radius: var(--radius-full);
        background: var(--action-soft); color: var(--text-secondary); font: 500 13px/20px var(--font-sans); }
.chip:hover { background: var(--action-soft-hover); color: var(--text-primary); }
.chip[aria-selected="true"], .chip[aria-pressed="true"], .chip[aria-checked="true"] {
        background: var(--ink); color: var(--on-ink); }

/* Status badge — set --s to a status name via modifier classes */
.badge { height: 20px; padding: 0 8px 0 6px; gap: 4px; border-radius: var(--radius-full);
         display: inline-flex; align-items: center; font: 500 11px/16px var(--font-sans); color: var(--text-primary); }
.badge--success { background: var(--status-success-soft); } .badge--success svg { color: var(--status-success-glyph); }
.badge--danger  { background: var(--status-danger-soft);  } .badge--danger  svg { color: var(--status-danger-glyph);  }
/* …repeat for pending, warning, caution, info, neutral */

/* Status tile */
.status-tile { height: 72px; padding: 0 16px; gap: 12px; border-radius: var(--radius-xl);
               display: flex; align-items: center; background: var(--status-success-wash); }
.icon-chip { width: 40px; height: 40px; border-radius: var(--radius-full); background: var(--neutral-0);
             box-shadow: var(--shadow-sm); display: grid; place-items: center; color: var(--status-success-glyph); }

/* Metric card */
.metric-card { min-height: 144px; padding: 20px; border: 1px solid var(--border-subtle);
               border-radius: var(--radius-xl); background: var(--surface-raised);
               display: flex; flex-direction: column; justify-content: space-between; }
.metric-value { font: 500 24px/32px var(--font-sans); letter-spacing: -0.01em; font-variant-numeric: tabular-nums; }

/* Table */
.table { width: 100%; border-collapse: collapse; font-size: 13px; line-height: 20px; }
.table th { height: var(--row-h-header); padding: 0 16px; text-align: left; font-weight: 400; font-size: 12px;
            line-height: 16px; color: var(--text-tertiary); border-block: 1px solid var(--border-divider); }
.table td { height: var(--row-h); padding: 0 16px; color: var(--text-secondary); }
.table td.primary { color: var(--text-primary); font-weight: 500; }
.table :is(th, td):first-child { padding-left: calc(var(--content-inset) + 16px); }
.table :is(th, td):last-child  { padding-right: calc(var(--content-inset) + 16px); }
.table tbody tr:hover { background: var(--surface-subtle); }
.table tbody tr:last-child td { border-bottom: 1px solid var(--border-divider); }
```

### 15.4 Component API conventions (framework-agnostic)

| Component | Props / variants |
|---|---|
| Button | `variant: primary \| outline \| soft \| ghost \| onTint \| danger \| dangerOutline \| link`, `size: sm \| md \| lg`, `icon`, `iconPosition`, `count`, `loading`, `disabled` |
| IconButton | `shape: square \| circle`, `variant: bordered \| soft \| ghost \| onTint`, `size: 24–40`, `label` (required), `dot` |
| Chip | `selected`, `mode: tab \| radio \| toggle`, `showCheck`, `removable`, `size: sm \| md` |
| Badge | `status: success \| pending \| warning \| caution \| danger \| info \| neutral`, `variant: soft \| onTint \| dot`, `icon` |
| Tag | `hue: violet \| indigo \| sky \| mint \| butter \| coral \| copper` |
| StatusTile | `status`, `value`, `label`, `trailing: tally \| chevron \| none`, `interactive` |
| MetricCard | `icon`, `hue`, `title`, `value`, `label`, `info`, `action`, `viz: sparkline \| bars \| counts \| delta` |
| RecordCard | `hue`, `code`, `title`, `meta`, `detail{icon,title,meta}`, `footer[]`, `menu` |
| Avatar | `size: 20 \| 24 \| 32 \| 40 \| 56`, `src`, `name` (→ initials + hashed hue), `presence` |

Name components and props in the product's codebase convention, but keep these variant names so documentation and code stay aligned.

### 15.5 Suggested file structure

```
design/
  tokens.css            ← §15.1, unchanged across products (edit only the Product layer)
  base.css              ← reset, typography base, focus
  shell.css             ← app grid, sidebar, panel, topbar, page header, sections
  components/           ← one file per component in §9
  patterns/             ← lanes, split rail, time grid, record rows
DESIGN.md               ← this document
```

---

## 16. Design consistency checklist

Run this before shipping any page. Every item should be true.

**Shell and layout**
- [ ] The panel is white, radius 16, inset 12px into a tinted shell; the viewport does not scroll, the panel does.
- [ ] The sidebar sits on the shell (no separate background or border); the current page is a white pill with `--shadow-xs`.
- [ ] The topbar is a 60px bordered bar inset 12px inside the panel with breadcrumb left and 40px icon buttons right.
- [ ] The page has exactly one 24/32 500 title with a one-line description and a full-bleed hairline below the header.
- [ ] Every text-leading block starts at the 24px content inset; tables and grids run full-bleed with 40px first-cell inset.
- [ ] Regions are separated by hairlines or spacing, not nested cards. Nesting depth inside the panel ≤ L4.

**Color**
- [ ] The only accent for primary/selected states is ink black. No colored primary buttons exist.
- [ ] Compact selections are ink on white and white on gray; large-area selections use `--surface-muted` or an ink ring.
- [ ] Every hue on screen encodes a status or a category, and each status has a glyph and a text label.
- [ ] Pastels appear only as 50–300 backgrounds; saturated (600) color appears only as glyphs, dots, strokes and thin bars.
- [ ] Only one ambient hue is used, and only in the shell and single-series charts.
- [ ] No gradients except the shell and chart area fills.
- [ ] All text meets §3.9 contrast; `--text-tertiary` is not used on the shell or chips.

**Typography**
- [ ] Only weights 400/500 (600 for badge numerals). No 700, no ALL CAPS, sentence case everywhere.
- [ ] Sizes come only from the scale (32, 24, 16, 14, 13, 12, 11).
- [ ] All numbers in metrics, tables, times and counts use tabular figures.
- [ ] Long text truncates with a tooltip; numbers are abbreviated, never truncated.

**Shape and surface**
- [ ] Actions/filters are pills; containers are rounded rects; dates/avatars/icon chips are circles.
- [ ] Radii come only from the scale and step down when nested.
- [ ] Borders are 1px and use `--border-divider`, `--border-subtle` or `--border-control` only.
- [ ] Shadows appear only on white chips over tints, active nav/segments, and overlays.

**Components and behavior**
- [ ] Controls are 32px tall in the app (40 in forms/auth/mobile); icons are 14/16/18 with 1.5px stroke from one icon set.
- [ ] Every interactive element has hover, focus-visible, pressed, disabled and (if async) loading states.
- [ ] Tables have 40px headers, 44px rows, no zebra/dividers, right-aligned numbers and status badges.
- [ ] Empty, loading and error states exist for every data region and use the state block or quiet inline text.
- [ ] Destructive actions use undo (reversible) or a confirmation dialog (irreversible).
- [ ] Motion uses the duration/easing tokens, answers user actions only, and respects reduced motion.

**Responsive and accessibility**
- [ ] The shell transforms per §11.2 (collapsed rail at 1024–1279, drawer below 1024, full-screen panel below 768).
- [ ] Tables, lanes, time grids and modals use their mobile transformations; touch targets are ≥ 44px.
- [ ] Landmarks, `aria-current`, selection roles, labels and live regions are in place; keyboard operation works end to end.

**Identity check**
- [ ] Squint test: the screen reads as white paper on a soft gray desk, with a few pastel tabs and a handful of black marks.
- [ ] Shown next to a reference screenshot, the page looks like the same product family — even though its structure is different.

---

## 17. DealFlow product layer (Layer C)

How this system is applied in this repository. Everything above is unchanged; only the decisions below are specific to DealFlow.

**Files**

| File | Role |
|---|---|
| `src/app/inkwash.css` | §15.1 token file, pasted as is. The Product layer block sets the ambient hue and `--font-sans` (resolved to the Inter that `next/font` loads). |
| `src/app/design-system.css` | Components and patterns, scoped under `.df`, in the Tailwind `components` layer so utilities can still override a rule. |

**Ambient hue.** `sand` (§3.7), the preset for CRM and scheduling products.

**Shell.** Sidebar on the tinted shell, white panel inset 12px, 60px bordered topbar inside the panel, one 24/500 page header with a full-bleed hairline. The panel scrolls, the viewport does not (≥ 768px). The sidebar folds to the 72px rail with the toggle or `Ctrl/Cmd + \` (the choice is kept in `localStorage`), and is always the rail between 768 and 1279px. Below 768px the panel is the screen and navigation is a bottom tab bar.

**Navigation.** Ringkasan · Penjualan (Pipeline, Deal, Customer, Penawaran, Follow-up) · Keuangan (Invoice) · Pengaturan, filtered by role. The follow-up count is an ink count badge in the nav and a signal dot on the topbar bell.

**Category hues** (§3.8), fixed per concept: deals indigo, won and paid mint, money owed butter, overdue coral, follow-ups violet.

**Status mapping** (§3.6)

| DealFlow | Semantic | Hue |
|---|---|---|
| Deal Baru, quotation Draf | neutral | neutral |
| Deal Dihubungi / Terkualifikasi, quotation Terkirim, invoice Dibayar sebagian | info | sky |
| Deal Penawaran | pending | violet |
| Deal Negosiasi, quotation Kedaluwarsa, invoice Belum dibayar | warning | butter |
| Deal Menang, quotation Diterima, invoice Lunas | success | mint |
| Deal Kalah, quotation Ditolak, invoice Lewat jatuh tempo | danger | coral |

**Components in code**

| Pattern | Where |
|---|---|
| Page header (A) | `PageHeader` in `components/ui/misc.tsx` |
| Detail header (D) | `DetailHeader` in the same file |
| Status badge, count badge | `Badge`, `Count` in `components/ui/badge.tsx` |
| Metric card, status tile | `MetricCard`, `StatusTile` in `components/ui/stat.tsx` |
| Initials avatar with hashed hue | `Avatar` in `components/ui/misc.tsx` |
| Main region plus right rail | `.bleed.with-rail` > `.rail-main`, `.rail-divider`, `.rail-side` |
| Pipeline lanes | `.board` > `.column` > `.deal-card` |
| Anchored overlays (§8.14): menus, listboxes, search results, filter panels | `useFloating` in `components/ui/use-floating.ts`; the overlay carries `popover="manual"` so it renders in the top layer and no table, lane, panel or dialog clips it |
| Filter toolbar (§8.8) | `.toolbar`: search pill, ghost dropdowns, a customer picker pill, and `DateRangeFilter` (a `Popover` with the two dates) |
| State block (§9.18) | `EmptyState` with `size` `page` or `region` and `tone` `neutral`, `success` or `error`; `QuietEmpty` for one-line empty rows |
| Modal and drawer (§9.15) | `Dialog` with `size` `default`, `large` or `drawer`; header fixed, body scrolls, the closing `DialogFooter` sticks to the bottom |
| Centred auth (§8.12) | `AuthShell` in `components/auth-shell.tsx`, variants `form` and `state` |

**Screen decisions**

- Sign-in screens use the centred auth card, not the split layout: brand in the corner, one 400px card, and a quiet line of what the product does under it.
- Long create and edit forms (deal, customer, follow-up) open in the 560px drawer; short confirmations and payments stay modal.
- A list with no records yet shows only its first-run state block, without a toolbar; a filtered list with no matches keeps the toolbar and shows the no-results block.
- The dashboard of a new organization replaces its empty metrics with numbered setup steps.

**Known deviations from the reference**

- The `kbd` hint is a white chip with secondary text, not a `--neutral-400` chip with white text, because the latter measures 2.5:1.
- The 768–1023px off-canvas drawer (§11.2) is not built; that range uses the rail.
- Quotation PDFs (`src/server/pdf`) are documents, not UI, and keep their own type.
