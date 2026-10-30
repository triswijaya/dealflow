import { and, eq, inArray } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { requirePermission } from "@/server/auth/require-membership";
import { db } from "@/server/db/client";
import { activities, contacts, customers, deals, quotations } from "@/server/db/schema";
import { primaryContact, primaryContactJoin } from "@/server/customers/primary-contact";
import { buildWhatsAppDeepLink, renderFollowUpMessage } from "./message";

/**
 * WA-01/WA-02: builds the deep link and default message for following up
 * on a deal over WhatsApp.
 *
 * Scoped to followUp:["read"] (Owner/Admin/Sales), not the broader
 * "Membuka WhatsApp customer" matrix row that also names Finance: Finance
 * cannot read quotations at all in this milestone, never sees the
 * follow-up dashboard this action lives on (§6.2 "Dashboard sales ...
 * follow-up: Finance Tidak"), and the template's "sudah direview?"
 * question does not fit the only deals Finance can see (WON, where the
 * quotation is already ACCEPTED). A generic Finance-facing WhatsApp
 * opener -- e.g. for payment reminders -- is a separate, not-yet-built M3
 * concern, not this function.
 */
export async function buildFollowUpWhatsAppMessage(params: {
  headers: Headers;
  dealId: string;
  quotationId?: string;
}) {
  const actor = await requirePermission({ headers: params.headers, permission: { followUp: ["read"] } });

  const deal = await db.query.deals.findFirst({
    where: and(eq(deals.id, params.dealId), eq(deals.organizationId, actor.organizationId)),
  });
  if (!deal) {
    throw new APIError("NOT_FOUND", { message: "Deal not found" });
  }

  const customer = await db.query.customers.findFirst({
    where: and(eq(customers.id, deal.customerId), eq(customers.organizationId, actor.organizationId)),
  });
  if (!customer) {
    // deals.customerId is a composite-FK reference validated against this
    // same organization at createDeal time; reaching here would mean that
    // invariant broke, not a normal user error.
    throw new APIError("INTERNAL_SERVER_ERROR", { message: "Deal's customer not found" });
  }

  let quotation: { id: string; quotationNumber: string } | null = null;
  if (params.quotationId) {
    // WA-02: an explicit choice still has to belong to this deal.
    const chosen = await db.query.quotations.findFirst({
      where: and(
        eq(quotations.id, params.quotationId),
        eq(quotations.organizationId, actor.organizationId),
        eq(quotations.dealId, params.dealId),
      ),
      columns: { id: true, quotationNumber: true },
    });
    if (!chosen) {
      throw new APIError("NOT_FOUND", { message: "Quotation not found" });
    }
    quotation = chosen;
  } else {
    // WA-02: "default versi terbaru yang relevan" -- the most recently
    // sent quotation on this deal (any family), never a DRAFT no customer
    // has seen yet. Raw status, not effectiveQuotationStatus: a SENT
    // quotation that has since expired unanswered is exactly the case
    // worth following up on, so EXPIRED must not disqualify it.
    quotation =
      (await db.query.quotations.findFirst({
        where: and(
          eq(quotations.organizationId, actor.organizationId),
          eq(quotations.dealId, params.dealId),
          eq(quotations.isLatest, true),
          inArray(quotations.status, ["SENT", "ACCEPTED", "REJECTED"]),
        ),
        orderBy: (row, { desc }) => desc(row.sentAt),
        columns: { id: true, quotationNumber: true },
      })) ?? null;
  }

  // CUS-04: the message goes to the customer's primary contact. WhatsApp needs a phone number.
  const contact = await db.query.contacts.findFirst({
    where: and(eq(contacts.customerId, customer.id), eq(contacts.organizationId, actor.organizationId), eq(contacts.isPrimary, true)),
  });
  if (!contact?.phoneNormalized) {
    throw new APIError("BAD_REQUEST", { message: "The contact has no phone number for WhatsApp" });
  }

  const message = renderFollowUpMessage({
    customerName: contact.name,
    dealTitle: deal.title,
    quotationNumber: quotation?.quotationNumber ?? null,
  });
  const deepLink = buildWhatsAppDeepLink(contact.phoneNormalized, message);

  return { phoneInternational: contact.phoneNormalized, message, deepLink, quotationId: quotation?.id ?? null };
}

/**
 * WA-03: recording the click is optional ("boleh dicatat") and distinct
 * from a completed follow-up -- opening WhatsApp is not confirmation that
 * contact happened, so this never touches deals.lastActivityAt (§11.2
 * explicitly excludes "klik WhatsApp tanpa konfirmasi" from resetting
 * inactivity). No transaction: there is no accompanying state change to
 * keep atomic with a bare telemetry insert. No idempotency key: API-05
 * only requires one for invoice/payment/revision, and this event is
 * explicitly optional in the first place.
 */
export async function recordWhatsAppOpened(params: { headers: Headers; dealId: string; quotationId?: string }) {
  const actor = await requirePermission({ headers: params.headers, permission: { followUp: ["read"] } });

  const deal = await db.query.deals.findFirst({
    where: and(eq(deals.id, params.dealId), eq(deals.organizationId, actor.organizationId)),
    columns: { id: true },
  });
  if (!deal) {
    throw new APIError("NOT_FOUND", { message: "Deal not found" });
  }

  const [logged] = await db
    .insert(activities)
    .values({
      organizationId: actor.organizationId,
      dealId: params.dealId,
      entityType: "whatsapp",
      eventType: "opened",
      actorId: actor.userId,
      metadata: params.quotationId ? { quotationId: params.quotationId } : null,
      permissionCategory: "sales",
    })
    .returning();
  return logged;
}

export type WhatsAppComposerDto = {
  dealId: string;
  dealTitle: string;
  customerId: string;
  companyName: string;
  contactPerson: string;
  phoneNormalized: string;
  /** Every quotation on the deal, newest first, for WA-02's "choose a document". */
  quotations: { id: string; quotationNumber: string; status: string; isLatest: boolean }[];
  /** WA-02: the most recently sent relevant version, or null if none has been sent. */
  defaultQuotationId: string | null;
};

/**
 * Everything the "Kirim pesan WhatsApp" dialog needs in one read: who the
 * message goes to, which quotations it can refer to, and which one is the
 * default. The message text itself is rendered in the dialog (it is
 * editable, WA-02), from the same template functions the server uses.
 */
export async function getWhatsAppComposer(params: { headers: Headers; dealId: string }): Promise<WhatsAppComposerDto> {
  const built = await buildFollowUpWhatsAppMessage({ headers: params.headers, dealId: params.dealId });
  const actor = await requirePermission({ headers: params.headers, permission: { followUp: ["read"] } });

  const [deal] = await db
    .select({ title: deals.title, customerId: customers.id, companyName: customers.companyName, contactPerson: primaryContact.name })
    .from(deals)
    .innerJoin(customers, and(eq(customers.id, deals.customerId), eq(customers.organizationId, deals.organizationId)))
    .leftJoin(primaryContact, primaryContactJoin)
    .where(and(eq(deals.id, params.dealId), eq(deals.organizationId, actor.organizationId)))
    .limit(1);
  if (!deal) {
    throw new APIError("NOT_FOUND", { message: "Deal not found" });
  }

  const rows = await db.query.quotations.findMany({
    where: and(eq(quotations.organizationId, actor.organizationId), eq(quotations.dealId, params.dealId)),
    orderBy: (row, { desc }) => [desc(row.createdAt), desc(row.id)],
    columns: { id: true, quotationNumber: true, status: true, isLatest: true },
  });

  return {
    dealId: params.dealId,
    dealTitle: deal.title,
    customerId: deal.customerId,
    companyName: deal.companyName,
    contactPerson: deal.contactPerson ?? "",
    phoneNormalized: built.phoneInternational,
    quotations: rows,
    defaultQuotationId: built.quotationId,
  };
}
