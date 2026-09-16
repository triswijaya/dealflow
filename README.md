# DealFlow

DealFlow is a sales-to-cash tool for small and medium B2B businesses that currently track leads, quotations, follow-ups, and invoices across WhatsApp, spreadsheets, and separate documents. It aims to give one place to see a prospective customer's journey from first contact through quotation, follow-up, deal outcome, invoice, and payment.

## Status

Early development. Foundation scaffold only (Next.js app boots, local PostgreSQL available via Docker). No business features exist yet.

## Requirement

The authoritative product and engineering specification lives in [requirement.md](requirement.md). It is the single source of truth for scope, business rules, architecture, and acceptance requirements.

## Prerequisites

- Node.js 24.x (pinned in `.nvmrc`)
- pnpm (version pinned in `package.json`'s `packageManager` field; enable via `corepack enable`)
- Docker (for local PostgreSQL)

## Local development

```sh
pnpm install --frozen-lockfile
docker compose up -d db
pnpm dev
```

Other commands that currently work:

```sh
pnpm lint
pnpm typecheck
pnpm build
```

Database migration, seeding, and automated test commands will be documented once they exist.
