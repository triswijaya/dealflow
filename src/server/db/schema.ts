// Better Auth tables generated via `npx auth@1.7.2 generate` against
// src/server/auth/auth.ts, then reviewed and committed here (TENANT-05:
// review plugin-generated schema before migration); includes two additions
// beyond the generated output: a unique index on member.userId, enforcing
// AUTH-05 (one active organization per user) at the database level as a
// defense-in-depth alongside the beforeAddMember hook in auth.ts, and
// member.deactivatedAt (AUTH-04), registered with Better Auth via the
// organization plugin's schema.member.additionalFields config.
import { relations } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
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
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
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
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
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
// and the deal-scoped activities table are a separate, later commit; this
// table's shape already includes the columns those need (status, lostReason,
// lostNote, wonAt, wonValue, lostAt) so no migration churn when that lands.
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
    wonAt: timestamp("won_at"),
    wonValue: bigint("won_value", { mode: "bigint" }),
    lostAt: timestamp("lost_at"),
    lastActivityAt: timestamp("last_activity_at").defaultNow().notNull(),
    // DATA-07: optimistic concurrency. Every update checks and increments
    // this; a stale version means someone else edited first.
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
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
    createdAt: timestamp("created_at").defaultNow().notNull(),
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
