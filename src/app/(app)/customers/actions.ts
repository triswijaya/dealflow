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
import { createContact, deleteContact, setPrimaryContact, updateContact } from "@/server/customers/contacts";
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

/** CUS-04: a customer's people. An id and version means edit, otherwise add. */
export async function saveContactAction(input: {
  customerId: string;
  contactId?: string;
  expectedVersion?: number;
  values: { name: string; role: string; phone: string; email: string };
}): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const requestHeaders = await headers();
    const saved =
      input.contactId && input.expectedVersion !== undefined
        ? await updateContact({ headers: requestHeaders, contactId: input.contactId, expectedVersion: input.expectedVersion, input: input.values })
        : await createContact({ headers: requestHeaders, customerId: input.customerId, input: input.values });
    revalidatePath(`/customers/${input.customerId}`);
    return { id: saved.id };
  });
}

export async function setPrimaryContactAction(input: { customerId: string; contactId: string; expectedVersion: number }): Promise<ActionResult<{ id: string }>> {
  return runAction(async () => {
    const saved = await setPrimaryContact({ headers: await headers(), contactId: input.contactId, expectedVersion: input.expectedVersion });
    revalidatePath("/customers");
    revalidatePath(`/customers/${input.customerId}`);
    return { id: saved.id };
  });
}

export async function deleteContactAction(input: { customerId: string; contactId: string; expectedVersion: number }): Promise<ActionResult<null>> {
  return runAction(async () => {
    await deleteContact({ headers: await headers(), contactId: input.contactId, expectedVersion: input.expectedVersion });
    revalidatePath(`/customers/${input.customerId}`);
    return null;
  });
}
