import { and, asc, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { requirePermission } from "@/server/auth/require-membership";
import { db } from "@/server/db/client";
import { activities, customers, deals, invoices, organizationSettings, quotationItems, quotations, user } from "@/server/db/schema";
import { toIsoDto, toMoneyDto } from "@/server/shared/dto";
import { buildDocumentSnapshots, type CustomerSnapshot, type SellerSnapshot } from "@/server/shared/document-snapshots";
import { organizationClock } from "@/server/shared/organization-clock";
import { buildPaginatedDto, resolvePagination } from "@/server/shared/pagination";
import { toQuotationDto, type QuotationDto } from "./dto";
import { effectiveQuotationStatus } from "./effective-status";

// Read models for the quotation screens. The mutations stay in quotations.ts;
// this file only joins what a screen needs (deal and customer names, the
// document header, version history, who did what).

const STATUSES = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"] as const;

const filterSchema = z.object({
  query: z.string().trim().max(200).optional(),
  customerId: z.string().uuid().optional(),
  status: z.enum(STATUSES).optional(),
  /** Default true: one row per revision family, its newest version. */
  latestOnly: z.boolean().optional(),
});

export type QuotationFilters = z.input<typeof filterSchema>;

function escapeLike(value: string) {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

/**
 * QUO-10's effective status as a SQL condition: EXPIRED is a SENT quotation
 * past its validity date in the organization's calendar, so the other
 * statuses must exclude it, and a draft past its date stays a draft.
 */
function statusCondition(status: (typeof STATUSES)[number], today: string): SQL {
  switch (status) {
    case "SENT":
      return and(eq(quotations.status, "SENT"), sql`${quotations.validUntil} >= ${today}::date`)!;
    case "EXPIRED":
      return and(eq(quotations.status, "SENT"), sql`${quotations.validUntil} < ${today}::date`)!;
    default:
      return eq(quotations.status, status);
  }
}

export type QuotationRowDto = {
  id: string;
  quotationNumber: string;
  familyId: string;
  revisionNumber: number;
  isLatest: boolean;
  status: string;
  issueDate: string;
  validUntil: string;
  total: string;
  dealId: string;
  dealTitle: string;
  customerId: string;
  customerName: string;
};

export async function listQuotationRows(params: { headers: Headers; page?: number; pageSize?: number; filters?: QuotationFilters }) {
  const actor = await requirePermission({ headers: params.headers, permission: { quotation: ["read"] } });
  const { page, pageSize, limit, offset } = resolvePagination(params);
  const filters = filterSchema.parse(params.filters ?? {});
  const { today } = await organizationClock(actor.organizationId);

  const conditions: (SQL | undefined)[] = [eq(quotations.organizationId, actor.organizationId)];
  if (filters.latestOnly !== false) conditions.push(eq(quotations.isLatest, true));
  if (filters.customerId) conditions.push(eq(quotations.customerId, filters.customerId));
  if (filters.status) conditions.push(statusCondition(filters.status, today));
  if (filters.query) {
    // SEARCH-01: the number, or the deal and customer it belongs to.
    const pattern = `%${escapeLike(filters.query)}%`;
    conditions.push(or(ilike(quotations.quotationNumber, pattern), ilike(deals.title, pattern), ilike(customers.companyName, pattern)));
  }
  const where = and(...conditions);

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({ quotation: quotations, dealTitle: deals.title, customerName: customers.companyName })
      .from(quotations)
      .innerJoin(deals, and(eq(deals.id, quotations.dealId), eq(deals.organizationId, quotations.organizationId)))
      .innerJoin(customers, and(eq(customers.id, quotations.customerId), eq(customers.organizationId, quotations.organizationId)))
      .where(where)
      // SEARCH-02: stable sort, newest issued first, the id breaking ties.
      .orderBy(desc(quotations.issueDate), desc(quotations.createdAt), desc(quotations.id))
      .limit(limit)
      .offset(offset),
    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(quotations)
      .innerJoin(deals, and(eq(deals.id, quotations.dealId), eq(deals.organizationId, quotations.organizationId)))
      .innerJoin(customers, and(eq(customers.id, quotations.customerId), eq(customers.organizationId, quotations.organizationId)))
      .where(where),
  ]);

  const items: QuotationRowDto[] = rows.map(({ quotation, dealTitle, customerName }) => ({
    id: quotation.id,
    quotationNumber: quotation.quotationNumber,
    familyId: quotation.familyId,
    revisionNumber: quotation.revisionNumber,
    isLatest: quotation.isLatest,
    status: effectiveQuotationStatus(quotation, today),
    issueDate: quotation.issueDate,
    validUntil: quotation.validUntil,
    total: toMoneyDto(quotation.total),
    dealId: quotation.dealId,
    dealTitle,
    customerId: quotation.customerId,
    customerName,
  }));
  return buildPaginatedDto(items, page, pageSize, count);
}

// ---------------------------------------------------------------------------
// Detail

const creator = alias(user, "creator");
const acceptor = alias(user, "acceptor");
const rejector = alias(user, "rejector");

export type QuotationDetailDto = QuotationDto & {
  dealTitle: string;
  dealStatus: string;
  customerName: string;
  createdByName: string | null;
  acceptedByName: string | null;
  rejectedByName: string | null;
  /** Who marked it sent: the sent event's actor (the row itself records only when). */
  sentByName: string | null;
  /** The document header: the frozen snapshot, or live company/customer data while it is still a draft. */
  seller: SellerSnapshot;
  customer: CustomerSnapshot;
  /** Every version of the family, oldest first. */
  versions: { id: string; quotationNumber: string; status: string; isLatest: boolean; issueDate: string; revisionNumber: number }[];
  latestVersionId: string;
  /** An invoice issued from this quotation, for roles that may open invoices. */
  invoice: { id: string; invoiceNumber: string } | null;
};

export async function getQuotationDetail(params: { headers: Headers; quotationId: string }): Promise<QuotationDetailDto> {
  const actor = await requirePermission({ headers: params.headers, permission: { quotation: ["read"] } });
  const id = z.string().uuid().safeParse(params.quotationId);
  if (!id.success) throw new APIError("NOT_FOUND", { message: "Quotation not found" });
  const { today } = await organizationClock(actor.organizationId);

  const [row] = await db
    .select({
      quotation: quotations,
      dealTitle: deals.title,
      dealStatus: deals.status,
      customerName: customers.companyName,
      createdByName: creator.name,
      acceptedByName: acceptor.name,
      rejectedByName: rejector.name,
    })
    .from(quotations)
    .innerJoin(deals, and(eq(deals.id, quotations.dealId), eq(deals.organizationId, quotations.organizationId)))
    .innerJoin(customers, and(eq(customers.id, quotations.customerId), eq(customers.organizationId, quotations.organizationId)))
    .leftJoin(creator, eq(creator.id, quotations.createdById))
    .leftJoin(acceptor, eq(acceptor.id, quotations.acceptedById))
    .leftJoin(rejector, eq(rejector.id, quotations.rejectedById))
    .where(and(eq(quotations.id, id.data), eq(quotations.organizationId, actor.organizationId)))
    .limit(1);
  if (!row) throw new APIError("NOT_FOUND", { message: "Quotation not found" });

  // A separate query, not a nested `with`: drizzle drops trailing zeros on a
  // numeric column read through a relation, and MONEY-02 needs the exact string.
  const items = await db.query.quotationItems.findMany({
    where: eq(quotationItems.quotationId, row.quotation.id),
    orderBy: (item, { asc: ascOp }) => ascOp(item.sortOrder),
  });

  const snapshots =
    row.quotation.frozenAt !== null
      ? { seller: row.quotation.sellerSnapshot as SellerSnapshot, customer: row.quotation.customerSnapshot as CustomerSnapshot }
      : await buildDocumentSnapshots(db, { organizationId: actor.organizationId, customerId: row.quotation.customerId, dealId: row.quotation.dealId });

  const versions = await db
    .select({
      id: quotations.id,
      quotationNumber: quotations.quotationNumber,
      status: quotations.status,
      validUntil: quotations.validUntil,
      isLatest: quotations.isLatest,
      issueDate: quotations.issueDate,
      revisionNumber: quotations.revisionNumber,
    })
    .from(quotations)
    .where(and(eq(quotations.organizationId, actor.organizationId), eq(quotations.familyId, row.quotation.familyId)))
    .orderBy(asc(quotations.revisionNumber), asc(quotations.id));

  const [sentEvent] = await db
    .select({ actorName: user.name })
    .from(activities)
    .leftJoin(user, eq(user.id, activities.actorId))
    .where(
      and(
        eq(activities.organizationId, actor.organizationId),
        eq(activities.dealId, row.quotation.dealId),
        eq(activities.entityType, "quotation"),
        eq(activities.eventType, "sent"),
        sql`${activities.metadata}->>'quotationId' = ${row.quotation.id}`,
      ),
    )
    .orderBy(asc(activities.createdAt))
    .limit(1);

  let invoice: QuotationDetailDto["invoice"] = null;
  if (actor.role === "OWNER" || actor.role === "ADMIN") {
    const [linked] = await db
      .select({ id: invoices.id, invoiceNumber: invoices.invoiceNumber })
      .from(invoices)
      .where(and(eq(invoices.organizationId, actor.organizationId), eq(invoices.quotationId, row.quotation.id)))
      .limit(1);
    invoice = linked ?? null;
  }

  return {
    ...toQuotationDto(row.quotation, items, today),
    dealTitle: row.dealTitle,
    dealStatus: row.dealStatus,
    customerName: row.customerName,
    createdByName: row.createdByName,
    acceptedByName: row.acceptedByName,
    rejectedByName: row.rejectedByName,
    sentByName: sentEvent?.actorName ?? null,
    seller: snapshots.seller,
    customer: snapshots.customer,
    versions: versions.map((version) => ({
      id: version.id,
      quotationNumber: version.quotationNumber,
      status: effectiveQuotationStatus(version, today),
      isLatest: version.isLatest,
      issueDate: version.issueDate,
      revisionNumber: version.revisionNumber,
    })),
    latestVersionId: versions.find((version) => version.isLatest)?.id ?? row.quotation.id,
    invoice,
  };
}

/** The activity trail of one quotation: created, revised, sent, accepted or rejected. */
export async function listQuotationActivities(params: { headers: Headers; quotationId: string }) {
  const actor = await requirePermission({ headers: params.headers, permission: { quotation: ["read"] } });
  const id = z.string().uuid().safeParse(params.quotationId);
  if (!id.success) throw new APIError("NOT_FOUND", { message: "Quotation not found" });
  const quotation = await db.query.quotations.findFirst({
    where: and(eq(quotations.id, id.data), eq(quotations.organizationId, actor.organizationId)),
    columns: { id: true, dealId: true },
  });
  if (!quotation) throw new APIError("NOT_FOUND", { message: "Quotation not found" });

  const actorUser = alias(user, "actor_user");
  const rows = await db
    .select({ activity: activities, actorName: actorUser.name })
    .from(activities)
    .leftJoin(actorUser, eq(actorUser.id, activities.actorId))
    .where(
      and(
        eq(activities.organizationId, actor.organizationId),
        eq(activities.dealId, quotation.dealId),
        eq(activities.entityType, "quotation"),
        or(
          sql`${activities.metadata}->>'quotationId' = ${quotation.id}`,
          sql`${activities.metadata}->>'newQuotationId' = ${quotation.id}`,
          sql`${activities.metadata}->>'sourceQuotationId' = ${quotation.id}`,
        ),
      ),
    )
    .orderBy(desc(activities.createdAt), desc(activities.id));

  return rows.map(({ activity, actorName }) => ({
    id: activity.id,
    entityType: activity.entityType,
    eventType: activity.eventType,
    actorId: activity.actorId,
    actorName,
    createdAt: toIsoDto(activity.createdAt),
    metadata: (activity.metadata as Record<string, unknown> | null) ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Version history (Q-04)

export type QuotationVersionDto = {
  id: string;
  quotationNumber: string;
  revisionNumber: number;
  isLatest: boolean;
  status: string;
  issueDate: string;
  validUntil: string;
  total: string;
  itemCount: number;
  createdByName: string | null;
  /** The number this version was revised from; null for the first version. */
  revisedFromNumber: string | null;
};

export async function listQuotationVersions(params: { headers: Headers; quotationId: string }) {
  const actor = await requirePermission({ headers: params.headers, permission: { quotation: ["read"] } });
  const id = z.string().uuid().safeParse(params.quotationId);
  if (!id.success) throw new APIError("NOT_FOUND", { message: "Quotation not found" });
  const { today } = await organizationClock(actor.organizationId);

  const anchor = await db.query.quotations.findFirst({
    where: and(eq(quotations.id, id.data), eq(quotations.organizationId, actor.organizationId)),
    columns: { familyId: true },
  });
  if (!anchor) throw new APIError("NOT_FOUND", { message: "Quotation not found" });

  const previous = alias(quotations, "previous");
  const rows = await db
    .select({
      quotation: quotations,
      createdByName: creator.name,
      revisedFromNumber: previous.quotationNumber,
      itemCount: sql<number>`(select count(*) from ${quotationItems} where ${quotationItems.quotationId} = ${quotations.id})`.mapWith(Number),
    })
    .from(quotations)
    .leftJoin(creator, eq(creator.id, quotations.createdById))
    .leftJoin(previous, eq(previous.id, quotations.previousRevisionId))
    .where(and(eq(quotations.organizationId, actor.organizationId), eq(quotations.familyId, anchor.familyId)))
    .orderBy(desc(quotations.revisionNumber), desc(quotations.id));

  const baseNumber = rows.at(-1)?.quotation.quotationNumber ?? "";
  const versions: QuotationVersionDto[] = rows.map(({ quotation, createdByName, revisedFromNumber, itemCount }) => ({
    id: quotation.id,
    quotationNumber: quotation.quotationNumber,
    revisionNumber: quotation.revisionNumber,
    isLatest: quotation.isLatest,
    status: effectiveQuotationStatus(quotation, today),
    issueDate: quotation.issueDate,
    validUntil: quotation.validUntil,
    total: toMoneyDto(quotation.total),
    itemCount,
    createdByName,
    revisedFromNumber,
  }));
  return { familyNumber: baseNumber, versions };
}

// ---------------------------------------------------------------------------
// Editor context

export type QuotationEditorContextDto = {
  deal: { id: string; title: string; status: string };
  customer: { id: string; companyName: string };
  /** UX-06: the company's standard terms, offered as the starting text. */
  defaultTerms: string | null;
  today: string;
};

/** What the new-quotation page needs about the deal it is for. */
export async function getQuotationEditorContext(params: { headers: Headers; dealId: string }): Promise<QuotationEditorContextDto> {
  const actor = await requirePermission({ headers: params.headers, permission: { quotation: ["write"] } });
  const id = z.string().uuid().safeParse(params.dealId);
  if (!id.success) throw new APIError("NOT_FOUND", { message: "Deal not found" });
  const [row] = await db
    .select({ deal: deals, customer: customers })
    .from(deals)
    .innerJoin(customers, and(eq(customers.id, deals.customerId), eq(customers.organizationId, deals.organizationId)))
    .where(and(eq(deals.id, id.data), eq(deals.organizationId, actor.organizationId)))
    .limit(1);
  if (!row) throw new APIError("NOT_FOUND", { message: "Deal not found" });
  const settings = await db.query.organizationSettings.findFirst({
    where: eq(organizationSettings.organizationId, actor.organizationId),
    columns: { defaultQuotationTerms: true },
  });
  const { today } = await organizationClock(actor.organizationId);
  return {
    deal: { id: row.deal.id, title: row.deal.title, status: row.deal.status },
    customer: { id: row.customer.id, companyName: row.customer.companyName },
    defaultTerms: settings?.defaultQuotationTerms ?? null,
    today,
  };
}
