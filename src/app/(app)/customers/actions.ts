"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import type { ActionResult } from "@/lib/action-result";
import {
  createCustomer,
  findSimilarCustomers,
  searchCustomerOptions,
  updateCustomer,
  type CustomerOptionDto,
} from "@/server/customers/customers";
import { runAction } from "@/server/shared/action";

export type SimilarCustomer = { id: string; companyName: string; contactPerson: string };

/** One action for both forms: an id and version means edit, otherwise create. */
export async function saveCustomerAction(input: {
  customerId?: string;
  expectedVersion?: number;
  values: unknown;
}): Promise<ActionResult<CustomerOptionDto>> {
  return runAction(async () => {
    const requestHeaders = await headers();
    const saved =
      input.customerId && input.expectedVersion !== undefined
        ? await updateCustomer({
            headers: requestHeaders,
            customerId: input.customerId,
            expectedVersion: input.expectedVersion,
            input: input.values,
          })
        : await createCustomer({ headers: requestHeaders, input: input.values });
    revalidatePath("/customers");
    revalidatePath(`/customers/${saved.id}`);
    return { id: saved.id, companyName: saved.companyName, contactPerson: saved.contactPerson };
  });
}

export async function findSimilarCustomersAction(input: {
  companyName?: string;
  phone?: string;
  email?: string;
  taxId?: string;
  excludeCustomerId?: string;
}): Promise<ActionResult<SimilarCustomer[]>> {
  return runAction(async () =>
    findSimilarCustomers({
      headers: await headers(),
      companyName: input.companyName,
      phone: input.phone,
      email: input.email,
      taxId: input.taxId,
      excludeCustomerId: input.excludeCustomerId,
    }),
  );
}

/** The customer picker's search-as-you-type. */
export async function searchCustomersAction(input: { query: string }): Promise<ActionResult<CustomerOptionDto[]>> {
  return runAction(async () => searchCustomerOptions({ headers: await headers(), query: input.query }));
}
