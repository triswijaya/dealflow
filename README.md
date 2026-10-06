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
| Browser E2E (Playwright), Sentry, CI, live deployment | Not started |

## Stack

Next.js (App Router), React, TypeScript, PostgreSQL with Drizzle ORM, Better Auth (organization plugin), Zod, Tailwind CSS, Vitest.

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
- Activity timestamps show when the seed ran, because they are written by the services as the data is created.

### Troubleshooting

- `docker compose up -d db` fails with a port conflict: something else on this machine is already using `5432` (including another clone of this same repo). Stop it first, or change the host port in `compose.yaml`.
- `pnpm dev`/`pnpm build` fails with "Invalid environment configuration": a required variable in `.env.local` is missing or malformed. The error lists exactly which field and why.
