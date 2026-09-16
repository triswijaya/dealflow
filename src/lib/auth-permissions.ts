import { createAccessControl } from "better-auth/plugins/access";

// Organization-level permissions only (§6.2 "Mengelola settings dan user").
// Business permissions (customer.write, deal.transition, ...) are added in
// the commit that introduces each module, not declared speculatively here.
const statement = {
  organization: ["update"],
  member: ["create", "update", "delete"],
  invitation: ["create", "cancel"],
} as const;

export const ac = createAccessControl(statement);

// RBAC-01: named permission bundles per role, not ad hoc role checks.
export const roles = {
  OWNER: ac.newRole({
    organization: ["update"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
  }),
  ADMIN: ac.newRole({
    organization: ["update"],
    member: ["create", "update", "delete"],
    invitation: ["create", "cancel"],
  }),
  SALES: ac.newRole({}),
  FINANCE: ac.newRole({}),
};
