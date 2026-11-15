# Landing page design language

The landing page sells one action, **Buat ruang kerja** (`/register`), to sales and finance teams of Indonesian B2B businesses. It is built on two references: the visual system of the `elaya-landing-page-design` skill (type, spacing, radius, motion, copy rules) and the conversion and accessibility checklist of `ui-ux-pro-max`. The composition borrows patterns from the reference screenshots in the owner's private notes (dark centred hero, feature list beside a large product image, plan cards, column footer), never their brand.

Everything a visitor reads is in `content.ts`, so every claim can be checked against the product. The product images are real screenshots of the app on the seeded demo company (NusaTech Solutions, fictional).

## Page

| # | Section | Background | Notes |
|---|---|---|---|
| 1 | Hero `#beranda` | dark, splits onto white under the product window | Promise, one primary CTA, facts line, dashboard screenshot with two floating cards (desktop only) |
| 2 | Problem `#masalah` | white | "Sebelum" (four scattered files) next to "Di DealFlow" (one deal's history) |
| 3 | Product tour `#produk` | sunken | Five items, one open at a time, the open item's screenshot on a sticky stage; inline under the item below 960px. Footer links `#fitur-<key>` open the matching item |
| 4 | Tagline reveal | white | Large type, words light up one by one in reading order on scroll |
| 5 | Roles `#peran` | dark | The sidebar menus each role sees, copied from `src/components/app-shell/nav.ts` |
| 6 | Steps `#cara-kerja` | white | Three steps, each with a small static sample of its screen |
| 7 | Pricing `#harga` | sunken | Proposed plans, labelled as not on sale, plus what every plan includes |
| 8 | FAQ `#faq` | white | Exclusive `details` accordion, mirrored as FAQPage structured data in `page.tsx` |
| 9 | Closing CTA `#mulai` | dark card | Same promise and action as the hero |

## Tokens

All in `landing.css` under `.lp`.

- **Spacing:** `--s-25` to `--s-900` = 2, 4, 8, 12, 16, 24, 32, 40, 48, 64, 80, 96px. Nothing in between.
- **Radius:** Tailwind steps (`--r-md` 6, `--r-lg` 8, `--r-xl` 12, `--r-2xl` 16, `--r-3xl` 24, `--r-full`). Nested shapes closer than 32px take the outer radius minus the gap: window 16 with 8 padding gives the screenshot 8; nav 16 with 8 padding gives its buttons 8.
- **Light:** `#FFFFFF` canvas, `#F7F8FA` sunken bands, `#E6E8EC` hairlines, `#14161B` ink, `#5B616C` body, `#868C97` dim (large text only).
- **Dark:** only `#181818` ground, `#1F1F1F` cards, `#272727` raised, `#313131` lines; text `#FFFFFF`, `#A3A3A3`, `#8C8C8C`.
- **Accent:** `#F2862B` for the small kicker and chip dots, darkened to `#A8510B` where it is text (the open tour number); `#15A34A` for paid progress and checks. No blue, indigo or violet.
- **Backgrounds are flat.** The only gradient is the hero heading text, white to `#9B9B9B`.

## Type

Geist only; Geist Mono for figures (rupiah, document numbers, step numbers) and the wordmark. Every element uses a named style, each a Tailwind step:

| Style | Size / line | Weight | Phone |
|---|---|---|---|
| `heading-1` | 60 / 60 | 600 | 36 / 40 (48 / 48 below 960px) |
| `heading-2` | 48 / 48 | 600 | 30 / 36 (36 / 40 below 960px) |
| `heading-3` | 36 / 40 | 600 | 24 / 32 |
| `heading-6` | 20 / 28 | 600 | |
| `title-1`, `title-3`, `title-4` | 20, 16, 14 | 500 | |
| `body-3`, `body-6` | 16, 14 | 400 | |
| `body-7` (added: text-lg regular) | 18 / 28 | 400 | 16 / 24 |
| `button-md`, `button-sm` | 16, 14 | 600 | |
| `caption-1` to `caption-5` | 14 or 12 | 600 to 400 | |

Hero heading and subheading are capped at 680px with a hand placed line break. Headings balance, paragraphs wrap pretty.

## Motion

One curve, `cubic-bezier(0.22, 1, 0.36, 1)`: 500ms for movement, 300ms for colour on hover. Only transform and opacity move. Sections rise 32px and fade in once (`IntersectionObserver`); the hero enters on load; the tour cross fades screenshots; the tagline is driven by one `requestAnimationFrame` throttled scroll listener that only lives while the block is near the screen. `prefers-reduced-motion` turns movement into plain fades and shows the tagline finished.

## Copy rules

- Sentence case. No hyphens and no em dashes in copy (labels quoted from the app, like "Follow-up", stay as the app writes them).
- No invented facts: no customer logos, testimonials, user counts or ratings. Prices are the proposal already in the repo and say so on the page.
- Banned filler: revolutionize, supercharge, effortless, and the like. Say what the product does.

## Not done here

Privacy policy and terms pages: their content has to come from the owner, so the footer does not link to pages that do not exist.
