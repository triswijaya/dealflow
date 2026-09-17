import { createAccessControl } from "better-auth/plugins/access";

// Business permissions are added in the commit that introduces each module,
// not declared speculatively. customer.* and deal.* are M1's first (§6.2).
const statement = {
  organization: ["update"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  customer: ["read", "write"],
  deal: ["read", "write", "transition"],
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
  }),
  ADMIN: ac.newRole({
    organization: ["update"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
    customer: ["read", "write"],
    deal: ["read", "write", "transition"],
  }),
  SALES: ac.newRole({
    customer: ["read", "write"],
    deal: ["read", "write", "transition"],
  }),
  // §6.2: Finance can read every customer (not filtered), and can read
  // deals too, but only WON ones -- that filter happens in the deals
  // service query, not here, since ac/roles only grants/denies a whole
  // resource-action, it can't express a per-row status condition. Finance
  // cannot transition deal status at all ("Mengubah status, WON/LOST":
  // Tidak).
  FINANCE: ac.newRole({
    customer: ["read"],
    deal: ["read"],
  }),
};
