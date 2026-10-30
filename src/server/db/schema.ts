// Better Auth tables generated via `npx auth@1.7.2 generate` against
// src/server/auth/auth.ts, then reviewed and committed here (TENANT-05:
// review plugin-generated schema before migration); includes two additions
// beyond the generated output: a partial unique index on member.userId, enforcing
// AUTH-05 (one active organization per user) at the database level as a
// defense-in-depth alongside the beforeAddMember hook in auth.ts, and
// member.deactivatedAt (AUTH-04), registered with Better Auth via the
// organization plugin's schema.member.additionalFields config.
import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { CustomerSnapshot, SellerSnapshot } from "@/server/shared/document-snapshot-types";
import { DEAL_STATUSES, LOST_REASONS } from "@/server/deals/stages";

// MONEY-04: the same ceiling as MAX_MONEY_AMOUNT in server/money/amount.ts
// (Rp1.000.000.000.000.000), duplicated here as a literal because these
// CHECK constraints are raw SQL, not TypeScript, and so can't import it.
// Keep the two in sync by hand if this value ever changes.
const MAX_MONEY_AMOUNT_SQL = "1000000000000000";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    activeOrganizationId: text("active_organization_id"),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("account_userId_idx").on(table.userId),
  ],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const organization = pgTable("organization", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  logo: text("logo"),
  createdAt: timestamp("created_at").notNull(),
  metadata: text("metadata"),
});

export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").default("member").notNull(),
    createdAt: timestamp("created_at").notNull(),
    // AUTH-04/AUTH-06: null means active. Deactivation is a DealFlow concept
    // (registered as an additionalField in auth.ts) with no Better Auth
    // endpoint of its own; see server/auth/members.ts.
    deactivatedAt: timestamp("deactivated_at"),
  },
  (table) => [
    index("member_organizationId_idx").on(table.organizationId),
    // AUTH-05 defense-in-depth: one ACTIVE membership per user. Deactivated
    // rows are history and may pile up, which is what lets a person who left
    // one company join another with the same account (ADR-0001 platform
    // note, requirement §3). Resolve "the" membership through
    // server/auth/current-membership.ts, never a bare userId lookup.
    uniqueIndex("member_userId_active_uidx")
      .on(table.userId)
      .where(sql`${table.deactivatedAt} IS NULL`),
  ],
);

export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").default("pending").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("invitation_organizationId_idx").on(table.organizationId),
    index("invitation_email_idx").on(table.email),
  ],
);

// Business table (not Better Auth's own schema): organization-level settings
// created as part of owner registration (AUTH-02). §14.1 / UX-06.
export const organizationSettings = pgTable("organization_settings", {
  id: uuid("id").primaryKey().defaultRandom(),
  organizationId: text("organization_id")
    .notNull()
    .unique()
    .references(() => organization.id, { onDelete: "cascade" }),
  address: text("address"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  currency: text("currency").default("IDR").notNull(),
  timezone: text("timezone").default("Asia/Jakarta").notNull(),
  defaultQuotationTerms: text("default_quotation_terms"),
  // DATA-04: all instants use timestamptz UTC. Better Auth's own tables
  // (above) intentionally don't (TENANT-01 exempts them, and that's what
  // Better Auth's own schema generator produces), but this is our table.
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

// Business table (M1, CUS-01-03). UNIQUE(organizationId, id) exists purely
// so child tables (deals, later) can carry a composite FK
// (organizationId, customerId) REFERENCES customers(organizationId, id):
// TENANT-03's defense-in-depth against a wrong-tenant parent reference,
// enforced by Postgres itself, not just application-level WHERE clauses.
export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    companyName: text("company_name").notNull(),
    // CUS-01: NPWP, digits only, optional. Never a condition for a customer, deal or quotation.
    taxId: text("tax_id"),
    address: text("address"),
    notes: text("notes"),
    // DATA-07/API-01: optimistic concurrency. API-01's own contract table
    // names "version" as required input for customer update ("ID/version
    // saat update"), missed during M1 (that audit only checked §14.1's
    // field-by-field description, not this table) and closed here before
    // building on top of it further.
    version: integer("version").notNull().default(1),
    // DATA-04: all instants use timestamptz UTC.
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdById: text("created_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    updatedById: text("updated_by_id").references(() => user.id, { onDelete: "restrict" }),
  },
  (table) => [
    uniqueIndex("customers_organizationId_id_uidx").on(table.organizationId, table.id),
    index("customers_organizationId_idx").on(table.organizationId),
    index("customers_companyName_idx").on(table.companyName),
    check("customers_taxId_format_chk", sql`${table.taxId} IS NULL OR ${table.taxId} ~ '^[0-9]{15,16}$'`),
  ],
);

// CUS-04: the people at a customer. Exactly one is primary; the customer's own
// contact details are the primary contact's. Phone is stored as typed and
// normalized (WA-01 links use the normalized form).
export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id").notNull(),
    name: text("name").notNull(),
    role: text("role"),
    phoneRaw: text("phone_raw"),
    phoneNormalized: text("phone_normalized"),
    email: text("email"),
    isPrimary: boolean("is_primary").notNull().default(false),
    // DATA-07: optimistic concurrency, same pattern as customers.
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdById: text("created_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    updatedById: text("updated_by_id").references(() => user.id, { onDelete: "restrict" }),
  },
  (table) => [
    // TENANT-03: a contact cannot point at a customer of another organization.
    foreignKey({
      name: "contacts_customer_tenant_fk",
      columns: [table.organizationId, table.customerId],
      foreignColumns: [customers.organizationId, customers.id],
    }).onDelete("restrict"),
    // Lets a deal carry a composite FK to (organizationId, id) here.
    uniqueIndex("contacts_organizationId_id_uidx").on(table.organizationId, table.id),
    // The FK from a deal: a deal's contact must belong to the deal's customer.
    uniqueIndex("contacts_organizationId_customerId_id_uidx").on(table.organizationId, table.customerId, table.id),
    // "Tepat satu kontak utama per customer".
    uniqueIndex("contacts_customerId_primary_uidx").on(table.customerId).where(sql`${table.isPrimary}`),
    index("contacts_organizationId_customerId_idx").on(table.organizationId, table.customerId),
    index("contacts_organizationId_phoneNormalized_idx").on(table.organizationId, table.phoneNormalized),
    // CUS-04: a phone and/or an email, and a phone is stored both ways or not at all.
    check("contacts_phone_or_email_chk", sql`${table.phoneNormalized} IS NOT NULL OR ${table.email} IS NOT NULL`),
    check("contacts_phone_pair_chk", sql`(${table.phoneRaw} IS NULL) = (${table.phoneNormalized} IS NULL)`),
  ],
);

// Business table (M1, DEAL-01-07). Status transitions, WON/LOST handling,
// and activity logging live in server/deals/deals.ts (transitionDeal).
export const deals = pgTable(
  "deals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    customerId: uuid("customer_id").notNull(),
    // CUS-04: the person at the customer this deal is about (PIC). Optional;
    // WhatsApp falls back to the customer's primary contact without it.
    contactId: uuid("contact_id"),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    notes: text("notes"),
    // MONEY-01: rupiah as PostgreSQL bigint / TypeScript bigint, never a
    // floating-point number, all the way from schema to domain code.
    estimatedValue: bigint("estimated_value", { mode: "bigint" }).notNull(),
    status: text("status").notNull().default("PROSPECT"),
    assignedToId: text("assigned_to_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    // DATA-04: date-only field. Kept as a plain string (not Drizzle's default
    // Date-object mode) so it never round-trips through a JS Date and picks
    // up a timezone-dependent off-by-one-day bug.
    expectedCloseDate: date("expected_close_date", { mode: "string" }),
    lostReason: text("lost_reason"),
    lostNote: text("lost_note"),
    // DATA-04: all instants use timestamptz UTC.
    wonAt: timestamp("won_at", { withTimezone: true }),
    wonValue: bigint("won_value", { mode: "bigint" }),
    lostAt: timestamp("lost_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).defaultNow().notNull(),
    // DEAL-03/DEAL-09: set in the same statement that changes `status`; the age
    // of the current stage is read from here, not rebuilt from the activity log.
    stageEnteredAt: timestamp("stage_entered_at", { withTimezone: true }).defaultNow().notNull(),
    // DEAL-03: on hold is an overlay on an active stage, not a stage. Both are
    // set together (review date and why) or both are null.
    onHoldUntil: date("on_hold_until", { mode: "string" }),
    onHoldReason: text("on_hold_reason"),
    // DEAL-02: once a deal has a quotation, its customer_id can no longer
    // move via updateDeal's general edit path. Set once, inside the same
    // transaction as the quotation insert (see quotations.ts createQuotation),
    // and never cleared. Reading this alongside `existing` under
    // updateDeal's own optimistic-concurrency check (below) is what closes
    // the create-quotation-vs-update-deal race the requirement calls out:
    // whichever transaction commits first bumps `version`, so the loser
    // always reloads and sees hasQuotation already true.
    hasQuotation: boolean("has_quotation").notNull().default(false),
    // DATA-07: optimistic concurrency. Every update checks and increments
    // this; a stale version means someone else edited first.
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdById: text("created_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    updatedById: text("updated_by_id").references(() => user.id, { onDelete: "restrict" }),
  },
  (table) => [
    // TENANT-03: composite FK, not just a plain customerId reference. A row
    // whose customerId is valid but whose organizationId doesn't match that
    // customer's is rejected by Postgres itself, not only by application code.
    foreignKey({
      name: "deals_customer_tenant_fk",
      columns: [table.organizationId, table.customerId],
      foreignColumns: [customers.organizationId, customers.id],
    }).onDelete("restrict"),
    // The contact has to be one of this customer's (MATCH SIMPLE: not checked while contact_id is null).
    foreignKey({
      name: "deals_contact_customer_fk",
      columns: [table.organizationId, table.customerId, table.contactId],
      foreignColumns: [contacts.organizationId, contacts.customerId, contacts.id],
    }).onDelete("restrict"),
    // Same purpose as customers_organizationId_id_uidx: lets a child table
    // (activities) carry a composite FK to (organizationId, id) here.
    // Postgres requires the referenced side of a composite FK to have an
    // exact-match unique constraint, id alone being unique isn't enough.
    uniqueIndex("deals_organizationId_id_uidx").on(table.organizationId, table.id),
    index("deals_organizationId_status_idx").on(table.organizationId, table.status),
    index("deals_organizationId_assignedToId_idx").on(table.organizationId, table.assignedToId),
    index("deals_organizationId_customerId_idx").on(table.organizationId, table.customerId),
    index("deals_organizationId_createdAt_idx").on(table.organizationId, table.createdAt),
    index("deals_organizationId_wonAt_idx").on(table.organizationId, table.wonAt),
    // MONEY-04/MONEY-06: "estimated value ... maksimal Rp1e15", enforced at
    // the database layer, not only by deals.ts's Zod schema.
    check(
      "deals_estimatedValue_range_chk",
      sql`${table.estimatedValue} >= 0 AND ${table.estimatedValue} <= ${sql.raw(MAX_MONEY_AMOUNT_SQL)}`,
    ),
    check("deals_status_chk", sql`${table.status} IN (${sql.raw(DEAL_STATUSES.map((value) => `'${value}'`).join(", "))})`),
    check(
      "deals_lostReason_chk",
      sql`${table.lostReason} IS NULL OR ${table.lostReason} IN (${sql.raw(LOST_REASONS.map((value) => `'${value}'`).join(", "))})`,
    ),
    check("deals_onHold_pair_chk", sql`(${table.onHoldUntil} IS NULL) = (${table.onHoldReason} IS NULL)`),
    // Only an open deal can be on hold; WON and LOST clear it.
    check("deals_onHold_open_chk", sql`${table.onHoldUntil} IS NULL OR ${table.status} NOT IN ('WON', 'LOST')`),
    // §7.3 "Data wajib": PROPOSAL, NEGOTIATION and COMMITMENT need a positive value.
    check(
      "deals_stageValue_chk",
      sql`${table.status} NOT IN ('PROPOSAL', 'NEGOTIATION', 'COMMITMENT') OR ${table.estimatedValue} > 0`,
    ),
    // wonValue is a frozen copy of estimatedValue (DEAL-04) and nullable
    // until WON, so the same range applies only once it is set.
    check(
      "deals_wonValue_range_chk",
      sql`${table.wonValue} IS NULL OR (${table.wonValue} >= 0 AND ${table.wonValue} <= ${sql.raw(MAX_MONEY_AMOUNT_SQL)})`,
    ),
  ],
);

// Business table (M1, AUD-01-03). Write-only in this commit: logged
// alongside deal creation/transitions in the same transaction (DATA-06), but
// there is no read/list function or AUD-04 permission-category filtering
// yet, since nothing consumes it (that's a UI timeline feature, later).
// permissionCategory and operationId columns exist to match the documented
// contract and avoid a future migration, not because they're used yet.
export const activities = pgTable(
  "activities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    dealId: uuid("deal_id").notNull(),
    entityType: text("entity_type").notNull(),
    eventType: text("event_type").notNull(),
    // Nullable: a future system-generated event (e.g. an automated reminder)
    // has no human actor.
    actorId: text("actor_id").references(() => user.id, { onDelete: "restrict" }),
    metadata: jsonb("metadata"),
    permissionCategory: text("permission_category").notNull(),
    operationId: text("operation_id"),
    // DATA-04: all instants use timestamptz UTC.
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    foreignKey({
      name: "activities_deal_tenant_fk",
      columns: [table.organizationId, table.dealId],
      foreignColumns: [deals.organizationId, deals.id],
    }).onDelete("restrict"),
    // DATA-03: activities tenant+deal+created_at.
    index("activities_organizationId_dealId_createdAt_idx").on(table.organizationId, table.dealId, table.createdAt),
  ],
);

// Business table (M2, FUP-01-05). One row per scheduled/completed follow-up
// interaction on a deal (call/WhatsApp/email/meeting/other). FUP-02:
// reschedule history lives on the activities timeline (eventType
// "rescheduled"), not as version rows here -- this table only ever holds
// the current schedule/note/completion state.
export const followUps = pgTable(
  "follow_ups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    dealId: uuid("deal_id").notNull(),
    type: text("type").notNull(),
    note: text("note"),
    // DATA-04: all instants use timestamptz UTC. followUpAt/completedAt are
    // client-supplied (FUP-01/02: completedAt may log a past interaction),
    // unlike deals.wonAt/lostAt elsewhere -- still a plain UTC instant
    // either way, never round-tripped through anything timezone-dependent.
    followUpAt: timestamp("follow_up_at", { withTimezone: true }).notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    // FUP-02/FUP-04: a task that no longer matters (set when its deal closes).
    // It is neither open nor done, and reopening the deal does not revive it.
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    // DATA-07: optimistic concurrency, same pattern as deals/customers.
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdById: text("created_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    updatedById: text("updated_by_id").references(() => user.id, { onDelete: "restrict" }),
  },
  (table) => [
    // TENANT-03: composite FK, same pattern as activities_deal_tenant_fk.
    foreignKey({
      name: "follow_ups_deal_tenant_fk",
      columns: [table.organizationId, table.dealId],
      foreignColumns: [deals.organizationId, deals.id],
    }).onDelete("restrict"),
    // DATA-03: "follow-ups tenant+follow_up_at untuk yang belum selesai" --
    // partial index, since FUP-03's bucket query only ever reads rows that
    // are not yet completed.
    index("follow_ups_organizationId_followUpAt_idx")
      .on(table.organizationId, table.followUpAt)
      .where(sql`${table.completedAt} IS NULL AND ${table.cancelledAt} IS NULL`),
    check("follow_ups_not_done_and_cancelled_chk", sql`${table.completedAt} IS NULL OR ${table.cancelledAt} IS NULL`),
    // Per-deal listing (deal detail page, UX-01): cheap, and justified by
    // that real query pattern even though DATA-03 doesn't name it directly.
    index("follow_ups_organizationId_dealId_idx").on(table.organizationId, table.dealId),
  ],
);

// Business table (M2, QUO-04). One row per (organization, document type,
// year); document-number.ts claims the next sequence with a single atomic
// UPSERT inside the same transaction as the quotation insert, so two
// concurrent creates in the same org/year can never receive the same
// number. "QUOTATION" is the only documentType this milestone writes;
// invoice numbering (M3) reuses this table rather than adding its own.
export const documentCounters = pgTable(
  "document_counters",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    documentType: text("document_type").notNull(),
    year: integer("year").notNull(),
    // The next sequence number this (org, type, year) will hand out, i.e.
    // one past the last number actually claimed.
    nextSequence: integer("next_sequence").notNull().default(1),
  },
  // DATA-02: "counter tenant/type/year" -- the primary key both enforces
  // the uniqueness and gives document-number.ts's UPSERT its conflict
  // target.
  (table) => [primaryKey({ columns: [table.organizationId, table.documentType, table.year] })],
);

// Business table (M2, QUO-01-07). All family/revision/snapshot columns are
// added now even though revision creation (which is what first writes a
// non-null previousRevisionId or a second row in a family) lands in a
// later commit: the same reasoning as deals' won/lost columns in M1,
// avoiding migration churn for a shape the requirement already documents
// as this table's own field contract (§14.1).
export const quotations = pgTable(
  "quotations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    dealId: uuid("deal_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    // QUO-04: server-generated, immutable, "QT-2026-00042" / "-R1" / "-R2".
    quotationNumber: text("quotation_number").notNull(),
    // QUO-05/06: the id of the family's original quotation. Equal to this
    // row's own id when the row IS the original -- set explicitly by the
    // service at insert time (an application-generated UUID, not
    // defaultRandom()'s server-side default), since a self-referencing
    // value has to be known before the row exists.
    familyId: uuid("family_id").notNull(),
    revisionNumber: integer("revision_number").notNull().default(1),
    // Composite self-FK below ties this to the same tenant. Null for an
    // original quotation.
    previousRevisionId: uuid("previous_revision_id"),
    // QUO-06: exactly one row per family has isLatest = true, enforced by
    // the partial unique index below, not just application logic.
    isLatest: boolean("is_latest").notNull().default(true),
    // DATA-04: date-only fields, kept as plain strings for the same reason
    // as deals.expectedCloseDate: never round-tripped through a JS Date.
    issueDate: date("issue_date", { mode: "string" }).notNull(),
    validUntil: date("valid_until", { mode: "string" }).notNull(),
    // MONEY-01: bigint end to end, never a floating-point number.
    subtotal: bigint("subtotal", { mode: "bigint" }).notNull(),
    // A plain 0n default trips drizzle-kit's snapshot serializer (it
    // JSON.stringifies column defaults, and JSON.stringify can't handle
    // BigInt); sql`0` sidesteps that by storing the default as raw SQL
    // instead of a JS value.
    discount: bigint("discount", { mode: "bigint" }).notNull().default(sql`0`),
    tax: bigint("tax", { mode: "bigint" }).notNull().default(sql`0`),
    total: bigint("total", { mode: "bigint" }).notNull(),
    // MONEY-03/MONEY-07: the calculation rule version baked into this
    // snapshot, so a future formula change can never silently reinterpret
    // an already-stored total.
    calculationVersion: integer("calculation_version").notNull(),
    notes: text("notes"),
    terms: text("terms"),
    status: text("status").notNull().default("DRAFT"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    // QUO-09: "ACCEPTED dan REJECTED menyimpan timestamp/actor" -- who
    // recorded the customer's decision, not who created the quotation.
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedById: text("accepted_by_id").references(() => user.id, { onDelete: "restrict" }),
    rejectedAt: timestamp("rejected_at", { withTimezone: true }),
    rejectedById: text("rejected_by_id").references(() => user.id, { onDelete: "restrict" }),
    // QUO-06/PDF-02: once set, this version's commercial content
    // (seller/customer snapshot, items, terms) is frozen and can no longer
    // change, including via master-data edits elsewhere.
    frozenAt: timestamp("frozen_at", { withTimezone: true }),
    sellerSnapshot: jsonb("seller_snapshot").$type<SellerSnapshot>(),
    customerSnapshot: jsonb("customer_snapshot").$type<CustomerSnapshot>(),
    // QUO-03/DATA-07: optimistic concurrency for commercial edits. Named
    // distinctly from calculationVersion (a different axis entirely: this
    // one is "has anyone edited since I last read this row") and from
    // deals.version, so the two never get confused when both appear in the
    // same function.
    editVersion: integer("edit_version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdById: text("created_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    updatedById: text("updated_by_id").references(() => user.id, { onDelete: "restrict" }),
  },
  (table) => [
    // TENANT-03: composite FKs, matching the deals/customers pattern.
    foreignKey({
      name: "quotations_deal_tenant_fk",
      columns: [table.organizationId, table.dealId],
      foreignColumns: [deals.organizationId, deals.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "quotations_customer_tenant_fk",
      columns: [table.organizationId, table.customerId],
      foreignColumns: [customers.organizationId, customers.id],
    }).onDelete("restrict"),
    // Self-referencing composite FK: a revision's previousRevisionId must
    // be a quotation in the same organization. Null on both sides (an
    // original quotation) skips the check, matching every other nullable
    // composite FK in this schema.
    foreignKey({
      name: "quotations_previous_revision_tenant_fk",
      columns: [table.organizationId, table.previousRevisionId],
      foreignColumns: [table.organizationId, table.id],
    }).onDelete("restrict"),
    // Lets quotation_items carry a composite FK to (organizationId, id)
    // here, same purpose as customers_organizationId_id_uidx.
    uniqueIndex("quotations_organizationId_id_uidx").on(table.organizationId, table.id),
    // DATA-02: nomor quotation unik per tenant.
    uniqueIndex("quotations_organizationId_number_uidx").on(table.organizationId, table.quotationNumber),
    // DATA-02: family+revision index.
    uniqueIndex("quotations_organizationId_familyId_revisionNumber_uidx").on(
      table.organizationId,
      table.familyId,
      table.revisionNumber,
    ),
    // DATA-02: paling banyak satu latest version per family, enforced by
    // Postgres itself via a partial unique index, not just application code
    // remembering to flip the old row's isLatest off in the same transaction.
    uniqueIndex("quotations_familyId_latest_uidx").on(table.familyId).where(sql`${table.isLatest} = true`),
    // DATA-03: quotations tenant+deal (number lookup is already covered by
    // the unique index above).
    index("quotations_organizationId_dealId_idx").on(table.organizationId, table.dealId),
    // MONEY-04/MONEY-05/MONEY-06: nonnegative/range enforced at the
    // database layer, not only by the Zod schemas and calculation.ts.
    check(
      "quotations_subtotal_range_chk",
      sql`${table.subtotal} >= 0 AND ${table.subtotal} <= ${sql.raw(MAX_MONEY_AMOUNT_SQL)}`,
    ),
    check("quotations_discount_range_chk", sql`${table.discount} >= 0 AND ${table.discount} <= ${table.subtotal}`),
    check("quotations_tax_nonneg_chk", sql`${table.tax} >= 0`),
    // MONEY-05: "quotation/invoice tersimpan harus mempunyai total > 0".
    check(
      "quotations_total_range_chk",
      sql`${table.total} > 0 AND ${table.total} <= ${sql.raw(MAX_MONEY_AMOUNT_SQL)}`,
    ),
  ],
);

// Business table (M2, QUO-02). subtotal is always server-computed
// (calculateItemSubtotal), never trusted from the client (MONEY-06).
export const quotationItems = pgTable(
  "quotation_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    quotationId: uuid("quotation_id").notNull(),
    description: text("description").notNull(),
    // MONEY-02: numeric(12,3), read/written as a decimal string, never
    // Number -- see server/money/quantity.ts for the scaled-bigint domain
    // representation this round-trips through.
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    unit: text("unit").notNull(),
    unitPrice: bigint("unit_price", { mode: "bigint" }).notNull(),
    subtotal: bigint("subtotal", { mode: "bigint" }).notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [
    foreignKey({
      name: "quotation_items_quotation_tenant_fk",
      columns: [table.organizationId, table.quotationId],
      foreignColumns: [quotations.organizationId, quotations.id],
    }).onDelete("restrict"),
    index("quotation_items_organizationId_quotationId_idx").on(table.organizationId, table.quotationId),
    // DATA-02: item sort order per parent.
    uniqueIndex("quotation_items_quotationId_sortOrder_uidx").on(table.quotationId, table.sortOrder),
    // MONEY-04/MONEY-06: "Quantity 0 < q <= 1.000.000,000; unit price 0
    // sampai Rp1e15", enforced at the database layer too.
    check("quotation_items_quantity_range_chk", sql`${table.quantity} > 0 AND ${table.quantity} <= 1000000.000`),
    check(
      "quotation_items_unitPrice_range_chk",
      sql`${table.unitPrice} >= 0 AND ${table.unitPrice} <= ${sql.raw(MAX_MONEY_AMOUNT_SQL)}`,
    ),
    check(
      "quotation_items_subtotal_range_chk",
      sql`${table.subtotal} >= 0 AND ${table.subtotal} <= ${sql.raw(MAX_MONEY_AMOUNT_SQL)}`,
    ),
  ],
);

// Business table (M3, INV-01-04). One invoice per WON deal, immutable once
// issued (INV-03), so there is deliberately no `version` column: nothing
// ever edits an invoice row, and payment concurrency is handled by locking
// this row inside recordPayment's transaction (PAY-03 "lock invoice row"),
// not by an optimistic version check.
//
// paid_amount/remaining_amount are NOT stored: §14.1 lists them as "cached
// paid/status jika dipakai" (optional), and PAY-03 computes the balance
// fresh under the row lock anyway, so a cached copy would add an
// invalidation path without buying correctness.
export const invoices = pgTable(
  "invoices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    dealId: uuid("deal_id").notNull(),
    customerId: uuid("customer_id").notNull(),
    // INV-04: server-generated "INV-2026-00001", same numbering policy as
    // quotations (§8.2), sharing documentCounters via documentType.
    invoiceNumber: text("invoice_number").notNull(),
    // INV-01/INV-02: optional, and when present must be a specific version
    // belonging to this same deal.
    quotationId: uuid("quotation_id"),
    // DATA-04: date-only business fields, plain strings, never round-tripped
    // through a JS Date.
    issueDate: date("issue_date", { mode: "string" }).notNull(),
    dueDate: date("due_date", { mode: "string" }).notNull(),
    // MONEY-01: bigint end to end.
    subtotal: bigint("subtotal", { mode: "bigint" }).notNull(),
    discount: bigint("discount", { mode: "bigint" }).notNull().default(sql`0`),
    tax: bigint("tax", { mode: "bigint" }).notNull().default(sql`0`),
    total: bigint("total", { mode: "bigint" }).notNull(),
    calculationVersion: integer("calculation_version").notNull(),
    // §10.1 field table lists currency explicitly; §3 fixes it to IDR for
    // the MVP, so this records what the stored amounts mean rather than
    // offering a choice.
    currency: text("currency").notNull().default("IDR"),
    // Not in §10.1's field table, but INV-02 says an invoice copies
    // "notes/terms yang relevan" from its source quotation, which needs
    // somewhere to land. Commercially these matter more on an invoice than
    // on a quotation (payment terms the customer already agreed to), and
    // the eventual invoice PDF (INV-05, deferred) will need them.
    notes: text("notes"),
    terms: text("terms"),
    // INV-03: the final snapshot, frozen at issue time. Same shape as a
    // quotation's (shared/document-snapshots.ts).
    sellerSnapshot: jsonb("seller_snapshot").$type<SellerSnapshot>(),
    customerSnapshot: jsonb("customer_snapshot").$type<CustomerSnapshot>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    createdById: text("created_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
  },
  (table) => [
    // TENANT-03: composite FKs, so a row whose parent belongs to another
    // organization is rejected by Postgres, not only by service code.
    foreignKey({
      name: "invoices_deal_tenant_fk",
      columns: [table.organizationId, table.dealId],
      foreignColumns: [deals.organizationId, deals.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "invoices_customer_tenant_fk",
      columns: [table.organizationId, table.customerId],
      foreignColumns: [customers.organizationId, customers.id],
    }).onDelete("restrict"),
    foreignKey({
      name: "invoices_quotation_tenant_fk",
      columns: [table.organizationId, table.quotationId],
      foreignColumns: [quotations.organizationId, quotations.id],
    }).onDelete("restrict"),
    // Lets invoice_items carry a composite FK to (organizationId, id).
    uniqueIndex("invoices_organizationId_id_uidx").on(table.organizationId, table.id),
    // INV-04: "Unique (organization_id, deal_id) mencegah dua invoice untuk
    // satu deal." The last line of defence behind createInvoice's own
    // idempotency handling.
    uniqueIndex("invoices_organizationId_dealId_uidx").on(table.organizationId, table.dealId),
    // DATA-02: nomor invoice unik per tenant.
    uniqueIndex("invoices_organizationId_number_uidx").on(table.organizationId, table.invoiceNumber),
    // DATA-03: invoices tenant+customer/due_date.
    index("invoices_organizationId_customerId_idx").on(table.organizationId, table.customerId),
    index("invoices_organizationId_dueDate_idx").on(table.organizationId, table.dueDate),
    // §10.1: "due_date >= issue_date".
    check("invoices_dueDate_after_issueDate_chk", sql`${table.dueDate} >= ${table.issueDate}`),
    // MONEY-04/05/06, same ceilings as quotations.
    check(
      "invoices_subtotal_range_chk",
      sql`${table.subtotal} >= 0 AND ${table.subtotal} <= ${sql.raw(MAX_MONEY_AMOUNT_SQL)}`,
    ),
    check("invoices_discount_range_chk", sql`${table.discount} >= 0 AND ${table.discount} <= ${table.subtotal}`),
    check("invoices_tax_nonneg_chk", sql`${table.tax} >= 0`),
    check("invoices_total_range_chk", sql`${table.total} > 0 AND ${table.total} <= ${sql.raw(MAX_MONEY_AMOUNT_SQL)}`),
  ],
);

// Business table (M3, INV-02). Field/precision identical to
// quotation_items by requirement ("field/precision sama dengan quotation
// items"), which is also why both share documentItemSchema on the input
// side rather than each defining their own.
export const invoiceItems = pgTable(
  "invoice_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    invoiceId: uuid("invoice_id").notNull(),
    description: text("description").notNull(),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull(),
    unit: text("unit").notNull(),
    unitPrice: bigint("unit_price", { mode: "bigint" }).notNull(),
    subtotal: bigint("subtotal", { mode: "bigint" }).notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (table) => [
    foreignKey({
      name: "invoice_items_invoice_tenant_fk",
      columns: [table.organizationId, table.invoiceId],
      foreignColumns: [invoices.organizationId, invoices.id],
    }).onDelete("restrict"),
    index("invoice_items_organizationId_invoiceId_idx").on(table.organizationId, table.invoiceId),
    // DATA-02: item sort order per parent.
    uniqueIndex("invoice_items_invoiceId_sortOrder_uidx").on(table.invoiceId, table.sortOrder),
    check("invoice_items_quantity_range_chk", sql`${table.quantity} > 0 AND ${table.quantity} <= 1000000.000`),
    check(
      "invoice_items_unitPrice_range_chk",
      sql`${table.unitPrice} >= 0 AND ${table.unitPrice} <= ${sql.raw(MAX_MONEY_AMOUNT_SQL)}`,
    ),
    check(
      "invoice_items_subtotal_range_chk",
      sql`${table.subtotal} >= 0 AND ${table.subtotal} <= ${sql.raw(MAX_MONEY_AMOUNT_SQL)}`,
    ),
  ],
);

// Business table (M3, PAY-01-05). Append-only: PAY-05 forbids editing or
// deleting a recorded payment in the MVP, so there is no version column and
// no updated_at -- the only write path is the insert inside recordPayment's
// transaction.
//
// An invoice's paid/remaining balance is summed from these rows on every
// read rather than cached on the invoice (§14.1 "cached paid/status jika
// dipakai"), which is also what PAY-03's "hitung saldo terbaru" does under
// the invoice row lock before accepting a new payment.
export const payments = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    invoiceId: uuid("invoice_id").notNull(),
    // MONEY-01: rupiah as bigint. PAY-02 requires strictly positive, which
    // the CHECK below enforces at the database layer too.
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    // DATA-04: a business date, not an instant. createdAt below records when
    // it was actually entered, which PAY-02 keeps distinct from the date the
    // money moved.
    paymentDate: date("payment_date", { mode: "string" }).notNull(),
    // PAY-01: BANK_TRANSFER, CASH, OTHER. Validated in the service's Zod
    // schema, stored as plain text like every other status/enum column here.
    paymentMethod: text("payment_method").notNull(),
    reference: text("reference"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    createdById: text("created_by_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
  },
  (table) => [
    foreignKey({
      name: "payments_invoice_tenant_fk",
      columns: [table.organizationId, table.invoiceId],
      foreignColumns: [invoices.organizationId, invoices.id],
    }).onDelete("restrict"),
    // DATA-03: payments tenant+invoice.
    index("payments_organizationId_invoiceId_idx").on(table.organizationId, table.invoiceId),
    // PAY-02/MONEY-04/MONEY-06: strictly positive, within the money ceiling.
    check("payments_amount_range_chk", sql`${table.amount} > 0 AND ${table.amount} <= ${sql.raw(MAX_MONEY_AMOUNT_SQL)}`),
  ],
);

// Business table (M2, API-05). A natural-key lookup table, same shape as
// documentCounters: no separate id, the composite primary key IS the
// identity. First seen for quotation revisions; invoice/payment (M3) will
// write their own operationType values into this same table rather than
// each growing their own.
export const idempotencyRecords = pgTable(
  "idempotency_records",
  {
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    operationType: text("operation_type").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    // API-05: "Entity ID dan normalized payload fingerprint disimpan
    // sebagai data pembanding, bukan bagian unique key." A reused key with
    // a different payload is a client bug, not a legitimate retry, and is
    // rejected by comparing this column, not by the unique constraint alone.
    payloadFingerprint: text("payload_fingerprint").notNull(),
    resultEntityId: uuid("result_entity_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    // Explicit short name: the default auto-generated name exceeds
    // Postgres's 63-char identifier limit and gets silently truncated
    // otherwise (the same class of issue M1 hit on a composite FK name).
    primaryKey({ name: "idempotency_records_pk", columns: [table.organizationId, table.operationType, table.idempotencyKey] }),
  ],
);

// Business table (v2.0, AUD-04). The organization-level audit trail: who
// changed membership, invitations, settings and, in later phases, who reopened,
// voided or reversed what. Distinct from `activities`, which is a deal's
// business timeline. Append-only by trigger (migration 0018), so even a
// buggy query or a hand-run UPDATE cannot rewrite history; TRUNCATE is left
// alone so the demo seed can reset the database.
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "restrict" }),
    // Null means the system acted (a repair, a scheduled job).
    actorId: text("actor_id").references(() => user.id, { onDelete: "restrict" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    // Redacted summary of what changed, never a full record (AUD-02).
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("audit_events_organizationId_createdAt_idx").on(table.organizationId, table.createdAt)],
);

// Infrastructure table (v2.0, SEC-02), not a business table: it carries no
// organization_id because limits are per client (IP, email, invitation), often
// before anyone is signed in. `key` is a hash, so no IP or email is stored in
// the clear. Rows are cleaned up opportunistically by server/security/rate-limit.ts.
export const rateLimitBuckets = pgTable(
  "rate_limit_buckets",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("rate_limit_buckets_windowStartedAt_idx").on(table.windowStartedAt)],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  members: many(member),
  invitations: many(invitation),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const organizationRelations = relations(organization, ({ many, one }) => ({
  members: many(member),
  invitations: many(invitation),
  settings: one(organizationSettings, {
    fields: [organization.id],
    references: [organizationSettings.organizationId],
  }),
}));

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [member.userId],
    references: [user.id],
  }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [invitation.inviterId],
    references: [user.id],
  }),
}));

export const organizationSettingsRelations = relations(organizationSettings, ({ one }) => ({
  organization: one(organization, {
    fields: [organizationSettings.organizationId],
    references: [organization.id],
  }),
}));

export const customersRelations = relations(customers, ({ one }) => ({
  organization: one(organization, {
    fields: [customers.organizationId],
    references: [organization.id],
  }),
  createdBy: one(user, {
    fields: [customers.createdById],
    references: [user.id],
    relationName: "customerCreatedBy",
  }),
  updatedBy: one(user, {
    fields: [customers.updatedById],
    references: [user.id],
    relationName: "customerUpdatedBy",
  }),
}));

export const dealsRelations = relations(deals, ({ one }) => ({
  organization: one(organization, {
    fields: [deals.organizationId],
    references: [organization.id],
  }),
  customer: one(customers, {
    fields: [deals.customerId],
    references: [customers.id],
  }),
  assignedTo: one(user, {
    fields: [deals.assignedToId],
    references: [user.id],
    relationName: "dealAssignedTo",
  }),
  createdBy: one(user, {
    fields: [deals.createdById],
    references: [user.id],
    relationName: "dealCreatedBy",
  }),
  updatedBy: one(user, {
    fields: [deals.updatedById],
    references: [user.id],
    relationName: "dealUpdatedBy",
  }),
}));

export const activitiesRelations = relations(activities, ({ one }) => ({
  organization: one(organization, {
    fields: [activities.organizationId],
    references: [organization.id],
  }),
  deal: one(deals, {
    fields: [activities.dealId],
    references: [deals.id],
  }),
  actor: one(user, {
    fields: [activities.actorId],
    references: [user.id],
  }),
}));

export const followUpsRelations = relations(followUps, ({ one }) => ({
  organization: one(organization, {
    fields: [followUps.organizationId],
    references: [organization.id],
  }),
  deal: one(deals, {
    fields: [followUps.dealId],
    references: [deals.id],
  }),
  createdBy: one(user, {
    fields: [followUps.createdById],
    references: [user.id],
    relationName: "followUpCreatedBy",
  }),
  updatedBy: one(user, {
    fields: [followUps.updatedById],
    references: [user.id],
    relationName: "followUpUpdatedBy",
  }),
}));

export const quotationsRelations = relations(quotations, ({ one, many }) => ({
  organization: one(organization, {
    fields: [quotations.organizationId],
    references: [organization.id],
  }),
  deal: one(deals, {
    fields: [quotations.dealId],
    references: [deals.id],
  }),
  customer: one(customers, {
    fields: [quotations.customerId],
    references: [customers.id],
  }),
  previousRevision: one(quotations, {
    fields: [quotations.previousRevisionId],
    references: [quotations.id],
    relationName: "quotationRevisionChain",
  }),
  items: many(quotationItems),
  createdBy: one(user, {
    fields: [quotations.createdById],
    references: [user.id],
    relationName: "quotationCreatedBy",
  }),
  updatedBy: one(user, {
    fields: [quotations.updatedById],
    references: [user.id],
    relationName: "quotationUpdatedBy",
  }),
}));

export const invoicesRelations = relations(invoices, ({ one, many }) => ({
  organization: one(organization, {
    fields: [invoices.organizationId],
    references: [organization.id],
  }),
  deal: one(deals, {
    fields: [invoices.dealId],
    references: [deals.id],
  }),
  customer: one(customers, {
    fields: [invoices.customerId],
    references: [customers.id],
  }),
  sourceQuotation: one(quotations, {
    fields: [invoices.quotationId],
    references: [quotations.id],
  }),
  createdBy: one(user, {
    fields: [invoices.createdById],
    references: [user.id],
    relationName: "invoiceCreatedBy",
  }),
  items: many(invoiceItems),
}));

export const invoiceItemsRelations = relations(invoiceItems, ({ one }) => ({
  organization: one(organization, {
    fields: [invoiceItems.organizationId],
    references: [organization.id],
  }),
  invoice: one(invoices, {
    fields: [invoiceItems.invoiceId],
    references: [invoices.id],
  }),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  organization: one(organization, {
    fields: [payments.organizationId],
    references: [organization.id],
  }),
  invoice: one(invoices, {
    fields: [payments.invoiceId],
    references: [invoices.id],
  }),
  createdBy: one(user, {
    fields: [payments.createdById],
    references: [user.id],
    relationName: "paymentCreatedBy",
  }),
}));

export const quotationItemsRelations = relations(quotationItems, ({ one }) => ({
  quotation: one(quotations, {
    fields: [quotationItems.quotationId],
    references: [quotations.id],
  }),
}));
