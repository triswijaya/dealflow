# DealFlow

DealFlow is a sales-to-cash tool for small and medium B2B businesses that currently track leads, quotations, follow-ups, and invoices across WhatsApp, spreadsheets, and separate documents. It aims to give one place to see a prospective customer's journey from first contact through quotation, follow-up, deal outcome, invoice, and payment.

## Status

In active development. The backend for the core sales-to-cash flow is in place and covered by tests; the web interface is being built module by module.

| Area | State |
|---|---|
| Auth, organizations, roles (Owner, Admin, Sales, Finance), invitations | Backend done; login and register pages done |
| Customers | Backend and UI done (list, search, detail, add/edit) |
| Deals and pipeline (NEW, CONTACTED, QUALIFIED, QUOTATION, NEGOTIATION, WON/LOST) | Backend done; UI next |
| Quotations (revisions, status, PDF) | Backend done; UI planned |
| Follow-ups and WhatsApp links | Backend done; UI planned |
| Invoices and manual payments | Backend done; UI planned |
| Dashboard, settings, members, remaining auth flows | Planned |

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
```

`test:integration` and the `db:*` commands need `docker compose up -d db` running first. The schema covers Better Auth's tables plus the business tables (customers, deals, activities, follow-ups, quotations, invoices, payments). Seeding is not implemented yet.

### Troubleshooting

- `docker compose up -d db` fails with a port conflict: something else on this machine is already using `5432` (including another clone of this same repo). Stop it first, or change the host port in `compose.yaml`.
- `pnpm dev`/`pnpm build` fails with "Invalid environment configuration": a required variable in `.env.local` is missing or malformed. The error lists exactly which field and why.
