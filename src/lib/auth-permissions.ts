import { createAccessControl } from "better-auth/plugins/access";

// Business permissions are added in the commit that introduces each module,
// not declared speculatively. customer.* is M1's first (§6.2).
const statement = {
  organization: ["update"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
  customer: ["read", "write"],
} as const;

export const ac = createAccessControl(statement);

// RBAC-01: named permission bundles per role, not ad hoc role checks.
export const roles = {
  OWNER: ac.newRole({
    organization: ["update"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
    customer: ["read", "write"],
  }),
  ADMIN: ac.newRole({
    organization: ["update"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
    customer: ["read", "write"],
  }),
  SALES: ac.newRole({
    customer: ["read", "write"],
  }),
  // §6.2: Finance can read every customer (not filtered by deal status),
  // but cannot create/update one.
  FINANCE: ac.newRole({
    customer: ["read"],
  }),
};
