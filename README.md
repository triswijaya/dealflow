# DealFlow

DealFlow is a sales-to-cash tool for small and medium B2B businesses that currently track leads, quotations, follow-ups, and invoices across WhatsApp, spreadsheets, and separate documents. It aims to give one place to see a prospective customer's journey from first contact through quotation, follow-up, deal outcome, invoice, and payment.

## Status

In active development. The sales-to-cash flow is built end to end, backend and web interface, and covered by unit and integration tests. What remains is release work: browser E2E tests, monitoring, CI/CD and the live deployment (see `requirement.md` section 20).

| Area | State |
|---|---|
| Auth, organizations, roles (Owner, Admin, Sales, Finance), invitations | Done (register, login, onboarding, forgot/reset password, verify email, accept invitation) |
| Customers | Done (list, search, detail, add/edit) |
| Deals and pipeline (NEW, CONTACTED, QUALIFIED, QUOTATION, NEGOTIATION, WON/LOST) | Done (board, list, detail, stage dialogs, activity timeline) |
| Quotations (revisions, status, PDF) | Done (editor, versions and compare, PDF) |
| Follow-ups and WhatsApp links | Done |
| Invoices and manual payments | Done (partial payments, overdue) |
| Dashboard, global search, settings, members | Done (role-specific dashboards) |
| Landing page | Done (interactive product story, pricing preview) |
| Seeded demo data | Done (`pnpm db:seed`) |
| Browser E2E (Playwright) | Landing, health, security headers, SEO, login, the Sales to Finance hand-off with a tenant-isolation check, and an axe accessibility scan (WCAG 2.1 A and AA) of public and signed-in screens; runs in CI |
| Security headers and CSP, structured logging with redaction, dependency audit in CI | Done |
| Sentry, live deployment | Not started |

## Stack

Next.js (App Router), React, TypeScript, PostgreSQL with Drizzle ORM, Better Auth (organization plugin), Zod, Tailwind CSS, Vitest.

## Design system

The signed-in app follows the Inkwash design system in [DESIGN.md](DESIGN.md): tokens in `src/app/inkwash.css`, components in `src/app/design-system.css`.

## Requirement

The authoritative product and engineering specification lives in [requirement.md](requirement.md). It is the single source of truth for scope, business rules, architecture, and acceptance requirements.

## Prerequisites

- Node.js 24.x (pinned in `.nvmrc`)
- pnpm (version pinned in `package.json`'s `packageManager` field; enable via `corepack enable`)
- Docker (for local PostgreSQL)

## Local development

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
docker compose up -d db
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Edit `.env.local` after copying it:
- `DATABASE_URL` and `DATABASE_MIGRATION_URL`: `postgresql://dealflow:dealflow@localhost:5432/dealflow` (matches `compose.yaml`).
- `BETTER_AUTH_SECRET`: generate with `openssl rand -base64 32`.
- `BETTER_AUTH_URL` and `APP_URL`: `http://localhost:3000`.

Other commands that currently work:

```sh
pnpm lint
pnpm typecheck
pnpm build
pnpm test:unit
pnpm test:integration
pnpm test:e2e
pnpm db:generate
pnpm db:migrate
pnpm db:check
pnpm db:seed
```

`test:integration` and the `db:*` commands need `docker compose up -d db` running first. The schema covers Better Auth's tables plus the business tables (customers, deals, activities, follow-ups, quotations, invoices, payments).

## Demo data

`pnpm db:seed` builds a fictional company, **NusaTech Solutions** (CCTV, networking and office IT), through the same service functions the app uses, so every status, total and activity row follows the real business rules. It creates:

- 24 customers, 24 deals (15 active across all five stages, 6 won, 3 lost with reasons), 17 quotations (draft, sent, accepted, rejected, expired and an R0 to R2 revision family), 5 invoices (paid, partially paid, unpaid, overdue, partially paid and overdue) with payments by bank transfer, cash and other, and follow-ups that are overdue, due today, upcoming and completed.
- Five accounts for the roles, plus a second organization (Kreasi Cipta Digital) for showing tenant isolation. All share one demo password, the `DEMO_PASSWORD` constant in `scripts/seed/data.ts`.

| Role | Account |
|---|---|
| Owner | `aditya@nusatech.test` |
| Admin | `maya@nusatech.test` |
| Sales | `andi@nusatech.test`, `rina@nusatech.test` |
| Finance | `dewi@nusatech.test` |
| Owner of the second organization | `bagas@kreasicipta.test` |

Everything is invented: company names, people, `.test` email addresses, and phone numbers in an unassigned `0811-0000-xxxx` range, so nothing can reach a real person.

- Dates are relative to an anchor date (today in Jakarta). For a fixed demo, set `SEED_ANCHOR_DATE=YYYY-MM-DD` (not in the future).
- The seed refuses to run unless `APP_ENV` is `local`, `test` or `demo`.
- If the demo already exists the seed stops. `pnpm db:seed --reset` empties **every table** first and then rebuilds it; it only runs against a local database host (or `APP_ENV=demo`).
- The services stamp every row with the moment the seed runs, so the seed then moves each deal's history back in time: customers were added 20 to 60 days ago, each deal's sales story ends on the day its invoice was issued (or it closed), and payments are dated on the day they were paid. Events inside one deal stay in order, but a deal's sales steps all share one day.

### End-to-end tests

`pnpm test:e2e` drives a real browser against a production build (`requirement.md` TEST-02). Prepare the database first, then build; Playwright starts `pnpm start` itself (or reuses a server already on port 3000):

```sh
pnpm db:seed --reset   # the login tests use the demo accounts
pnpm build
pnpm test:e2e
```

Locally the tests use your installed Google Chrome, so nothing is downloaded. `pnpm db:seed --reset` empties the database it points at; use a local one.

Two things to know when running it by hand:

- The hand-off test records a payment, so reseed (`pnpm db:seed --reset`) before every run against the same database.
- Better Auth limits sign-in to 3 per 10 seconds per IP in a production build and that limit stays on, so the tests pause between sign-ins (`tests/e2e/helpers.ts`). A full run takes about 20 seconds.

CI runs the same steps on a throwaway PostgreSQL service and uploads the Playwright report when a run fails.

## Security and logging

- `next.config.ts` applies security headers and a Content Security Policy from `src/server/security/headers.ts` (no framing, no plugins, scripts and connections limited to this origin; HSTS and `upgrade-insecure-requests` only on hosted environments). The policy is the nonce-free variant from the Next.js guide, so inline scripts are allowed; revisit this when Sentry is added.
- `src/server/shared/logger.ts` writes one JSON line per event (UTC timestamp, level, operation, request id, duration, status) and redacts passwords, tokens, cookies and connection strings before anything is printed. Errors are logged by name and code only.
- CI fails on a critical advisory in a production dependency (`pnpm audit --prod --audit-level=critical`). Lower-severity findings are reviewed by hand.
- `robots.txt` and `sitemap.xml` expose only the landing, login and register pages; signed-in screens and emailed one-time links are marked `noindex`.

## Health checks

Two endpoints are meant for uptime monitors and deploy checks. Neither needs a session and neither reveals anything about the deployment.

| Endpoint | Purpose | Responses |
|---|---|---|
| `GET /api/health` | Liveness: the process is up. Never touches the database. | `200 {"status":"ok"}` |
| `GET /api/health/ready` | Readiness: the instance can reach PostgreSQL (2 second limit, result cached for 5 seconds per instance). | `200 {"status":"ready"}` or `503 {"status":"unavailable"}` |

A failed readiness check does not say why; look at the server logs for the cause.

### Troubleshooting

- `docker compose up -d db` fails with a port conflict: something else on this machine is already using `5432` (including another clone of this same repo). Stop it first, or change the host port in `compose.yaml`.
- `pnpm dev`/`pnpm build` fails with "Invalid environment configuration": a required variable in `.env.local` is missing or malformed. The error lists exactly which field and why.
