// Better Auth tables generated via `npx auth@1.7.2 generate` against
// src/server/auth/auth.ts, then reviewed and committed here (TENANT-05:
// review plugin-generated schema before migration); includes two additions
// beyond the generated output: a unique index on member.userId, enforcing
// AUTH-05 (one active organization per user) at the database level as a
// defense-in-depth alongside the beforeAddMember hook in auth.ts, and
// member.deactivatedAt (AUTH-04), registered with Better Auth via the
// organization plugin's schema.member.additionalFields config.
import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
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
    issuer: text("issuer").notNull(),
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
    uniqueIndex("account_issuer_accountId_uidx").on(table.issuer, table.accountId),
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
    // AUTH-05 defense-in-depth: one membership row per user, period. Kept as
    // a plain (not partial-on-active) unique index deliberately: no product
    // flow re-admits a deactivated user into a different organization, so
    // "one membership ever" stays the simpler MVP rule.
    uniqueIndex("member_userId_uidx").on(table.userId),
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
    contactPerson: text("contact_person").notNull(),
    phoneRaw: text("phone_raw").notNull(),
    phoneNormalized: text("phone_normalized").notNull(),
    email: text("email"),
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
    index("customers_phoneNormalized_idx").on(table.phoneNormalized),
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
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    notes: text("notes"),
    // MONEY-01: rupiah as PostgreSQL bigint / TypeScript bigint, never a
    // floating-point number, all the way from schema to domain code.
    estimatedValue: bigint("estimated_value", { mode: "bigint" }).notNull(),
    status: text("status").notNull().default("NEW"),
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
    sellerSnapshot: jsonb("seller_snapshot"),
    customerSnapshot: jsonb("customer_snapshot"),
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

export const quotationItemsRelations = relations(quotationItems, ({ one }) => ({
  quotation: one(quotations, {
    fields: [quotationItems.quotationId],
    references: [quotations.id],
  }),
}));
