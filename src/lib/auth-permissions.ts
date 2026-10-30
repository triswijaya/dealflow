import { createAccessControl } from "better-auth/plugins/access";

// Business permissions are added in the commit that introduces each module,
// not declared speculatively. customer.* and deal.* are M1's; quotation.*
// is M2's first (§6.2 "Membuat/mengubah quotation draft, revisi, status,
// PDF": Owner/Admin/Sales Ya, Finance Tidak); followUp.* is M2's second,
// same three roles (§6.2 "Membuat/mengubah/menyelesaikan follow-up": Owner/
// Admin/Sales Ya, Finance Tidak -- and unlike quotation, Finance gets no
// read carve-out at all here, since nothing in §6/§9 grants Finance any
// follow-up visibility).
const statement = {
  organization: ["update"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  customer: ["read", "write"],
  deal: ["read", "write", "transition"],
  quotation: ["read", "write"],
  followUp: ["read", "write"],
  invoice: ["read", "write"],
  payment: ["read", "write"],
  order: ["read", "write"],
} as const;

export const ac = createAccessControl(statement);

// RBAC-01: named permission bundles per role, not ad hoc role checks.
export const roles = {
  OWNER: ac.newRole({
    organization: ["update"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
    customer: ["read", "write"],
    deal: ["read", "write", "transition"],
    quotation: ["read", "write"],
    followUp: ["read", "write"],
    invoice: ["read", "write"],
    payment: ["read", "write"],
    order: ["read", "write"],
  }),
  ADMIN: ac.newRole({
    organization: ["update"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
    customer: ["read", "write"],
    deal: ["read", "write", "transition"],
    quotation: ["read", "write"],
    followUp: ["read", "write"],
    invoice: ["read", "write"],
    payment: ["read", "write"],
    order: ["read", "write"],
  }),
  SALES: ac.newRole({
    customer: ["read", "write"],
    deal: ["read", "write", "transition"],
    quotation: ["read", "write"],
    followUp: ["read", "write"],
    order: ["read", "write"],
  }),
  // §6.2: Finance can read every customer (not filtered), and can read
  // deals too, but only WON ones -- that filter happens in the deals
  // service query, not here, since ac/roles only grants/denies a whole
  // resource-action, it can't express a per-row status condition. Finance
  // cannot transition deal status at all ("Mengubah status, WON/LOST":
  // Tidak), and cannot read or write quotations in this milestone either
  // ("Membaca quotation/PDF sebagai sumber invoice": hanya terkait deal
  // WON -- that's an M3 invoice-sourcing concern, not a general
  // quotation.read grant, so it's deliberately absent here). Same reasoning
  // keeps followUp off Finance entirely: no matrix row gives Finance any
  // follow-up access, read included.
  //
  // invoice.* and payment.* are Finance's own resources (§6.2
  // "Membuat/membaca invoice" and "Mencatat/membaca payment": Owner/Admin
  // Ya, Sales Tidak, Finance Ya). Sales is denied both outright, which is
  // what AT-19's "Sales memanggil payment endpoint manual ditolak"
  // exercises.
  //
  // invoice.write is also the only place Finance reaches quotation data,
  // and only from inside createInvoice, which has already proven the deal
  // is WON -- exactly the scope "Membaca quotation/PDF sebagai sumber
  // invoice: hanya terkait deal WON" allows. A standalone quotation.read
  // grant for Finance (for an invoice source picker) still needs the
  // per-row WON filter only the quotations service can apply, so it stays
  // absent until that UI exists.
  FINANCE: ac.newRole({
    customer: ["read"],
    deal: ["read"],
    invoice: ["read", "write"],
    payment: ["read", "write"],
    order: ["read", "write"],
  }),
};
