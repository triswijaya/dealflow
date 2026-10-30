import "./load-env";
import { eq, inArray, sql } from "drizzle-orm";
import { auth } from "@/server/auth/auth";
import { acceptInvitation, inviteMember, type InvitableRole } from "@/server/auth/members";
import { registerOwner } from "@/server/auth/register-owner";
import { createCustomer } from "@/server/customers/customers";
import { createDeal, getDeal, putDealOnHold, transitionDeal } from "@/server/deals/deals";
import { db } from "@/server/db/client";
import { quotations, user } from "@/server/db/schema";
import { createFollowUp } from "@/server/follow-ups/follow-ups";
import { createInvoice } from "@/server/invoices/invoices";
import { findReadyBillingItemOfDeal } from "@/server/invoices/invoice-views";
import { confirmWon } from "@/server/orders/orders";
import { recordPayment } from "@/server/invoices/payments";
import { createQuotation, getQuotation, reviseQuotation, transitionQuotationStatus, updateQuotation } from "@/server/quotations/quotations";
import { organizationDateString } from "@/server/shared/organization-date";
import { addDays, wib } from "./dates";
import { CUSTOMERS, DEALS, DEMO_PASSWORD, ORG, SECOND_ORG, type DealSpec, type InvoiceKind, type Stage, type TemplateName } from "./data";

// pnpm db:seed [--reset]
//
// Builds the fictional NusaTech Solutions demo (DEMO-01) through the same service
// functions the app uses, so every number, status and activity row obeys the real
// domain rules. Dates are relative to an anchor date (DEMO-02): today in Jakarta, or
// SEED_ANCHOR_DATE=YYYY-MM-DD for a fixed demo. Refuses to run outside local/test/demo.

const ALLOWED_ENVS = ["local", "test", "demo"];
const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "[::1]", "db"];
const RESET = process.argv.includes("--reset");

type Actor = { userId: string; headers: Headers };
const stats = { customers: 0, deals: 0, quotations: 0, invoices: 0, payments: 0, followUps: 0 };

function fail(message: string): never {
  console.error(`\nSeed aborted: ${message}\n`);
  process.exit(1);
}

function guardEnvironment() {
  const appEnv = process.env.APP_ENV ?? "";
  if (!ALLOWED_ENVS.includes(appEnv)) {
    fail(`APP_ENV is "${appEnv || "unset"}". The seed only runs against local, test or demo databases.`);
  }
  if (RESET) {
    const host = new URL(process.env.DATABASE_URL ?? "postgresql://unset").hostname;
    if (appEnv !== "demo" && !LOCAL_HOSTS.includes(host)) {
      fail(`--reset wipes every table and DATABASE_URL points at "${host}", which is not a local database.`);
    }
  }
}

async function resetDatabase() {
  const tables = (await db.execute(sql`select tablename from pg_tables where schemaname = 'public'`)) as unknown as { tablename: string }[];
  if (tables.length === 0) return;
  const names = tables.map((row) => `"${row.tablename}"`).join(", ");
  await db.execute(sql.raw(`truncate table ${names} restart identity cascade`));
  console.log(`Reset: emptied ${tables.length} tables.`);
}

async function assertNotSeeded() {
  const existing = await db.query.user.findFirst({ where: eq(user.email, ORG.people[0].email) });
  if (existing) {
    fail(`${ORG.people[0].email} already exists. Run \`pnpm db:seed --reset\` to rebuild the demo on this database.`);
  }
}

async function cookieFor(email: string): Promise<string> {
  const response = await auth.api.signInEmail({ body: { email, password: DEMO_PASSWORD }, asResponse: true });
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) throw new Error(`sign-in for ${email} did not return a session cookie`);
  return setCookie.split(";")[0];
}

async function createOwner(person: { name: string; email: string }, companyName: string) {
  const { organizationId, userId } = await registerOwner({ email: person.email, password: DEMO_PASSWORD, name: person.name, companyName });
  return { organizationId, actor: { userId, headers: new Headers({ cookie: await cookieFor(person.email) }) } satisfies Actor };
}

async function addMember(organizationId: string, owner: Actor, person: { name: string; email: string; role: InvitableRole }): Promise<Actor> {
  const invitation = await inviteMember({ email: person.email, role: person.role, organizationId, headers: owner.headers });
  await auth.api.signUpEmail({ body: { email: person.email, password: DEMO_PASSWORD, name: person.name } });
  const headers = new Headers({ cookie: await cookieFor(person.email) });
  const created = await db.query.user.findFirst({ where: eq(user.email, person.email) });
  await acceptInvitation({ invitationId: invitation.id, userId: created!.id, headers });
  return { userId: created!.id, headers };
}

// --- Line items -----------------------------------------------------------------

type Part = { description: string; quantity: number; unit: string; share: number };

const TEMPLATES: Record<TemplateName, { parts: (size: number) => Part[]; installLabel: string }> = {
  cctv: {
    parts: (n) => [
      { description: "CCTV Camera 4MP", quantity: n, unit: "unit", share: 0.45 },
      { description: n > 16 ? "NVR 32 channel" : "NVR 16 channel", quantity: 1, unit: "unit", share: 0.12 },
      { description: "Hard disk surveillance 4TB", quantity: Math.max(1, Math.ceil(n / 8)), unit: "unit", share: 0.1 },
      { description: "Kabel UTP Cat6", quantity: n * 25, unit: "meter", share: 0.08 },
    ],
    installLabel: "Instalasi & konfigurasi",
  },
  network: {
    parts: (n) => [
      { description: "Switch PoE 24 port", quantity: Math.max(1, Math.ceil(n / 6)), unit: "unit", share: 0.28 },
      { description: "Access point dual-band", quantity: n, unit: "unit", share: 0.3 },
      { description: "Kabel UTP Cat6", quantity: n * 40, unit: "meter", share: 0.08 },
      { description: "Rak jaringan & patch panel", quantity: 1, unit: "paket", share: 0.08 },
    ],
    installLabel: "Instalasi & konfigurasi jaringan",
  },
  maintenance: {
    parts: () => [
      { description: "Kunjungan maintenance berkala", quantity: 4, unit: "kunjungan", share: 0.62 },
      { description: "Penggantian sparepart (estimasi)", quantity: 1, unit: "paket", share: 0.2 },
    ],
    installLabel: "Laporan & dukungan teknis",
  },
  access: {
    parts: (n) => [
      { description: "Pembaca kartu access control", quantity: n, unit: "unit", share: 0.33 },
      { description: "Controller panel", quantity: 1, unit: "unit", share: 0.2 },
      { description: "Electric door lock", quantity: n, unit: "unit", share: 0.15 },
    ],
    installLabel: "Instalasi & integrasi absensi",
  },
};

/** Splits `total` across a template with round unit prices; the install line absorbs the remainder so the sum is exact. */
function buildItems(total: number, template: TemplateName, size = 8) {
  const { parts, installLabel } = TEMPLATES[template];
  const items = parts(size).map((part) => {
    const raw = (total * part.share) / part.quantity;
    const step = raw < 100_000 ? 1_000 : raw < 2_000_000 ? 5_000 : 50_000;
    return { description: part.description, quantity: part.quantity, unit: part.unit, unitPrice: Math.max(step, Math.round(raw / step) * step) };
  });
  const rest = total - items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  if (rest <= 0) throw new Error(`Template ${template} (size ${size}) does not fit Rp${total}`);
  items.push({ description: installLabel, quantity: 1, unit: "paket", unitPrice: rest });
  return items.map((item) => ({ description: item.description, quantity: String(item.quantity), unit: item.unit, unitPrice: String(item.unitPrice) }));
}

// --- Deals ----------------------------------------------------------------------

async function moveTo(actor: Actor, dealId: string, target: Stage) {
  const deal = await getDeal({ headers: actor.headers, dealId });
  if (deal.status === target) return;
  // Winning needs the evidence of the commitment, and makes the first order.
  if (target === "WON") await confirmWon({ headers: actor.headers, dealId, expectedVersion: deal.version, input: { commitmentType: "PURCHASE_ORDER", commitmentRef: `PO-${dealId.slice(0, 8).toUpperCase()}` } });
  else await transitionDeal({ headers: actor.headers, dealId, expectedVersion: deal.version, input: { toStatus: target } });
}

async function setQuotationStatus(actor: Actor, quotationId: string, toStatus: "SENT" | "ACCEPTED" | "REJECTED") {
  const current = await getQuotation({ headers: actor.headers, quotationId });
  await transitionQuotationStatus({ headers: actor.headers, quotationId, expectedEditVersion: current.editVersion, toStatus });
}

function quotationInput(spec: DealSpec, anchor: string, dealId: string, discount = 0) {
  return {
    dealId,
    validUntil: addDays(anchor, 14),
    items: buildItems(spec.value, spec.template!, spec.size),
    discount: String(discount),
    notes: "Harga sudah termasuk garansi pemasangan 12 bulan.",
    terms: "Pembayaran 50% di muka, pelunasan setelah serah terima pekerjaan.",
  };
}

async function seedQuotation(actor: Actor, spec: DealSpec, anchor: string, dealId: string) {
  const kind = spec.quote!;
  const first = await createQuotation({ headers: actor.headers, input: quotationInput(spec, anchor, dealId) });
  stats.quotations += 1;
  if (kind === "draft") return;

  await setQuotationStatus(actor, first.id, "SENT");
  if (kind === "accepted") await setQuotationStatus(actor, first.id, "ACCEPTED");
  if (kind === "rejected") await setQuotationStatus(actor, first.id, "REJECTED");

  if (kind === "expired") {
    // The service refuses to send an already-expired quotation, so let time "pass" by
    // moving the dates of a sent one back. It then reads as EXPIRED, which is derived.
    await db.update(quotations).set({ issueDate: addDays(anchor, -30), validUntil: addDays(anchor, -5) }).where(eq(quotations.id, first.id));
  }

  if (kind === "revised") {
    let previous = first;
    for (const percent of [0.03, 0.05]) {
      const revision = await reviseQuotation({
        headers: actor.headers,
        input: { sourceQuotationId: previous.id, expectedLatestQuotationId: previous.id, idempotencyKey: crypto.randomUUID() },
      });
      await updateQuotation({
        headers: actor.headers,
        quotationId: revision.id,
        expectedEditVersion: revision.editVersion,
        input: quotationInput(spec, anchor, dealId, Math.round((spec.value * percent) / 50_000) * 50_000),
      });
      await setQuotationStatus(actor, revision.id, "SENT");
      stats.quotations += 1;
      previous = revision;
    }
  }
}

const INVOICES: Record<InvoiceKind, { issue: number; due: number; payments: { day: number; method: "BANK_TRANSFER" | "CASH" | "OTHER"; label: string }[] }> = {
  paid: { issue: -24, due: -2, payments: [{ day: -23, method: "BANK_TRANSFER", label: "DP" }, { day: -9, method: "OTHER", label: "Termin 2" }, { day: 0, method: "BANK_TRANSFER", label: "Pelunasan" }] },
  partial: { issue: -6, due: 8, payments: [{ day: -5, method: "BANK_TRANSFER", label: "DP" }] },
  unpaid: { issue: -3, due: 11, payments: [] },
  overdue: { issue: -32, due: -9, payments: [] },
  partialOverdue: { issue: -21, due: -4, payments: [{ day: -18, method: "CASH", label: "DP" }] },
};

// The services stamp every row with the moment the seed runs, so the activity feed would read
// "just now" everywhere. These helpers move rows back in time afterwards, the same way the
// expired quotation above is dated. Whole stories are shifted by one amount, which keeps the
// order of events inside a deal intact.
async function ageDeal(dealId: string, days: number) {
  if (days <= 0) return;
  const back = sql`make_interval(days => ${days})`;
  await db.execute(sql`update activities set created_at = created_at - ${back} where deal_id = ${dealId}`);
  await db.execute(sql`update deals set created_at = created_at - ${back}, updated_at = updated_at - ${back}, last_activity_at = last_activity_at - ${back}, won_at = won_at - ${back}, lost_at = lost_at - ${back} where id = ${dealId}`);
  await db.execute(sql`update quotations set created_at = created_at - ${back}, updated_at = updated_at - ${back}, sent_at = sent_at - ${back}, accepted_at = accepted_at - ${back}, rejected_at = rejected_at - ${back}, frozen_at = frozen_at - ${back} where deal_id = ${dealId}`);
  await db.execute(sql`update orders set created_at = created_at - ${back}, commitment_date = commitment_date - ${days}::int where deal_id = ${dealId}`);
  await db.execute(sql`update invoices set created_at = created_at - ${back}, updated_at = updated_at - ${back} where deal_id = ${dealId}`);
  // A logged interaction cannot have been created after it happened.
  await db.execute(sql`update follow_ups set created_at = least(created_at - ${back}, coalesce(completed_at, created_at - ${back})), updated_at = least(updated_at - ${back}, coalesce(completed_at, updated_at - ${back})) where deal_id = ${dealId}`);
}

/** Invoices are dated on their issue day and payments on the day they were paid (Jakarta time), with the matching activity rows. */
async function alignFinance(dealId: string) {
  // The invoice follows the last sales event by a minute, so it never sorts before the deal it came from.
  await db.execute(sql`update invoices set created_at = (select max(created_at) from activities where deal_id = ${dealId} and entity_type <> 'invoice' and entity_type <> 'payment') + interval '1 minute' where deal_id = ${dealId}`);
  await db.execute(sql`update settlements set created_at = ((settled_on::timestamp + interval '10 hours') at time zone 'Asia/Jakarta') where invoice_id in (select id from invoices where deal_id = ${dealId})`);
  await db.execute(sql`update receipts set created_at = ((received_on::timestamp + interval '10 hours') at time zone 'Asia/Jakarta') where id in (select receipt_id from settlements where invoice_id in (select id from invoices where deal_id = ${dealId}))`);
  await db.execute(sql`update invoices i set updated_at = coalesce((select max(p.created_at) from settlements p where p.invoice_id = i.id), i.created_at) where i.deal_id = ${dealId}`);
  await db.execute(sql`update activities set created_at = i.created_at from invoices i where activities.deal_id = ${dealId} and activities.entity_type = 'invoice' and i.deal_id = activities.deal_id`);
  await db.execute(sql`
    with p as (select row_number() over (order by settled_on, id) as n, created_at from settlements where invoice_id in (select id from invoices where deal_id = ${dealId})),
         a as (select id, row_number() over (order by created_at, id) as n from activities where deal_id = ${dealId} and entity_type = 'payment')
    update activities set created_at = p.created_at from a join p on p.n = a.n where activities.id = a.id`);
  // The deal's last activity is the latest of everything above.
  await db.execute(sql`update deals set last_activity_at = greatest(last_activity_at, coalesce((select max(created_at) from activities where deal_id = ${dealId}), last_activity_at)) where id = ${dealId}`);
}

/** How many days ago the sales side of this deal last moved. */
function storyAge(spec: DealSpec, index: number): number {
  // The sales story ends when the invoice is issued; payments are dated separately (alignFinance).
  if (spec.invoice) return -INVOICES[spec.invoice].issue;
  if (spec.stage === "WON" || spec.stage === "LOST") return Math.max(1, -spec.closeInDays);
  return (index * 2) % 7;
}

async function seedInvoice(finance: Actor, spec: DealSpec, anchor: string, dealId: string, kind: InvoiceKind) {
  const plan = INVOICES[kind];
  const billingItemId = await findReadyBillingItemOfDeal({ headers: finance.headers, dealId });
  if (!billingItemId) throw new Error(`Deal ${dealId} has no billing item ready to invoice`);
  const invoice = await createInvoice({
    headers: finance.headers,
    input: {
      billingItemId,
      issueDate: addDays(anchor, plan.issue),
      dueDate: addDays(anchor, plan.due),
      items: buildItems(spec.value, spec.template!, spec.size),
      notes: `Invoice untuk ${spec.title}.`,
      terms: "Pembayaran ke rekening perusahaan, cantumkan nomor invoice pada berita transfer.",
      idempotencyKey: crypto.randomUUID(),
    },
  });
  stats.invoices += 1;

  // Three equal instalments of the invoice; the last one takes any rounding remainder.
  const instalment = Math.round(spec.value / 3 / 1_000) * 1_000;
  for (const [index, payment] of plan.payments.entries()) {
    const amount = index === 2 ? spec.value - instalment * 2 : instalment;
    await recordPayment({
      headers: finance.headers,
      input: {
        invoiceId: invoice.id,
        amount: String(amount),
        paymentDate: addDays(anchor, payment.day),
        paymentMethod: payment.method,
        reference: payment.method === "CASH" ? undefined : `TRF-${String(Math.abs(payment.day)).padStart(2, "0")}${index + 1}-${invoice.invoiceNumber.slice(-4)}`,
        note: payment.label,
        idempotencyKey: crypto.randomUUID(),
      },
    });
    stats.payments += 1;
  }
}

async function seedDeal(spec: DealSpec, index: number, anchor: string, customerIds: string[], team: Record<string, Actor>) {
  const sales = team[spec.sales];
  const deal = await createDeal({
    headers: sales.headers,
    input: {
      customerId: customerIds[spec.customer],
      title: spec.title,
      description: spec.description,
      estimatedValue: String(spec.value),
      expectedCloseDate: addDays(anchor, spec.closeInDays),
    },
  });
  stats.deals += 1;

  const followUp = async (fu: NonNullable<DealSpec["followUps"]>[number]) => {
    const at = wib(addDays(anchor, fu.days), fu.time);
    await createFollowUp({ headers: sales.headers, input: { dealId: deal.id, type: fu.type, note: fu.note, followUpAt: at, ...(fu.done ? { completedAt: at } : {}) } });
    stats.followUps += 1;
  };

  // Logged interactions go in before the deal closes; reminders only make sense while it is open.
  for (const fu of spec.followUps ?? []) if (fu.done) await followUp(fu);

  if (spec.quote) await seedQuotation(sales, spec, anchor, deal.id);

  if (spec.stage === "LOST") {
    const current = await getDeal({ headers: sales.headers, dealId: deal.id });
    await transitionDeal({ headers: sales.headers, dealId: deal.id, expectedVersion: current.version, input: { toStatus: "LOST", lostReason: spec.lost!.reason, lostNote: spec.lost!.note } });
  } else {
    await moveTo(sales, deal.id, spec.stage);
  }

  if (spec.hold) {
    const current = await getDeal({ headers: sales.headers, dealId: deal.id });
    await putDealOnHold({ headers: sales.headers, dealId: deal.id, expectedVersion: current.version, input: { reason: spec.hold.reason, reviewDate: addDays(anchor, spec.hold.days) } });
  }

  if (spec.stage !== "WON" && spec.stage !== "LOST") for (const fu of spec.followUps ?? []) if (!fu.done) await followUp(fu);
  if (spec.invoice) await seedInvoice(team.dewi, spec, anchor, deal.id, spec.invoice);

  await ageDeal(deal.id, storyAge(spec, index));
  if (spec.invoice) await alignFinance(deal.id);
}

async function seedSecondOrganization() {
  const { actor } = await createOwner(SECOND_ORG.owner, SECOND_ORG.name);
  const ids: string[] = [];
  for (const customer of SECOND_ORG.customers) {
    const created = await createCustomer({ headers: actor.headers, input: customer });
    ids.push(created.id);
  }
  for (const deal of SECOND_ORG.deals) {
    await createDeal({
      headers: actor.headers,
      input: { customerId: ids[deal.customer], title: deal.title, description: "", estimatedValue: String(deal.value), assignedToId: actor.userId },
    });
  }
}

async function main() {
  guardEnvironment();
  const today = organizationDateString("Asia/Jakarta", new Date());
  const anchor = process.env.SEED_ANCHOR_DATE ?? today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchor) || anchor > today) {
    fail(`SEED_ANCHOR_DATE must be a YYYY-MM-DD date that is not in the future (got "${anchor}").`);
  }
  if (RESET) await resetDatabase();
  await assertNotSeeded();
  console.log(`Seeding ${ORG.name} with anchor date ${anchor} ...`);

  const [ownerPerson, ...others] = ORG.people;
  const { organizationId, actor: owner } = await createOwner(ownerPerson, ORG.name);
  const team: Record<string, Actor> = { owner };
  for (const person of others) team[person.key] = await addMember(organizationId, owner, { name: person.name, email: person.email, role: person.role });

  const creators = [team.andi, team.rina, team.owner];
  const customerIds: string[] = [];
  for (const [index, customer] of CUSTOMERS.entries()) {
    const created = await createCustomer({ headers: creators[index % creators.length].headers, input: { ...customer, notes: customer.notes ?? undefined } });
    customerIds.push(created.id);
    stats.customers += 1;
    // Customers were added over the last two months, not all today.
    const age = 20 + ((index * 7) % 40);
    await db.execute(sql`update customers set created_at = created_at - make_interval(days => ${age}), updated_at = updated_at - make_interval(days => ${age}) where id = ${created.id}`);
  }

  for (const [index, spec] of DEALS.entries()) await seedDeal(spec, index, anchor, customerIds, team);
  await seedSecondOrganization();

  // Demo inboxes are .test addresses that never receive mail, so the app's "verify your
  // email" banner would be permanent noise. Mark the seeded accounts as verified.
  await db.update(user).set({ emailVerified: true }).where(inArray(user.email, [...ORG.people.map((person) => person.email), SECOND_ORG.owner.email]));

  console.log("\nDone.");
  console.log(`  ${stats.customers} customers, ${stats.deals} deals, ${stats.quotations} quotations, ${stats.invoices} invoices, ${stats.payments} payments, ${stats.followUps} follow-ups`);
  console.log(`  Second organization: ${SECOND_ORG.name} (for tenant isolation)`);
  console.log("\nSign in at /login with one of these accounts (the shared demo password is DEMO_PASSWORD in scripts/seed/data.ts):");
  for (const person of ORG.people) console.log(`  ${person.role.padEnd(8)} ${person.email}`);
  console.log(`  OWNER    ${SECOND_ORG.owner.email}  (${SECOND_ORG.name})`);
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error("\nSeed failed:", message);
    if (error instanceof Error && error.stack) console.error(error.stack.split("\n").slice(1, 6).join("\n"));
    process.exit(1);
  });
