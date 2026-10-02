import { and, eq } from "drizzle-orm";
import { APIError } from "better-auth/api";
import { z } from "zod";
import { requirePermission } from "@/server/auth/require-membership";
import { db } from "@/server/db/client";
import { organization, organizationSettings } from "@/server/db/schema";
import { toIsoDto } from "@/server/shared/dto";

// S-01: company profile. The name lives on Better Auth's organization row;
// everything else in organization_settings. Both are written in one
// transaction, guarded by the settings row's updatedAt so two admins editing
// at once cannot silently overwrite each other (API-06).

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? null);

const inputSchema = z.object({
  name: z.string().trim().min(2, "Nama perusahaan minimal 2 karakter.").max(120),
  contactEmail: z
    .string()
    .trim()
    .max(254)
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? null)
    .refine((value) => value === null || z.email().safeParse(value).success, "Masukkan email perusahaan yang valid."),
  contactPhone: optionalText(30).refine((value) => value === null || /^[+()\d][\d\s().-]{5,}$/.test(value), "Nomor telepon tidak valid."),
  address: optionalText(500),
  defaultQuotationTerms: optionalText(2000),
});

export type CompanySettingsInput = z.input<typeof inputSchema>;

export type CompanySettingsDto = {
  name: string;
  contactEmail: string | null;
  contactPhone: string | null;
  address: string | null;
  defaultQuotationTerms: string | null;
  currency: string;
  timezone: string;
  /** Concurrency token: send it back unchanged with the edit. */
  updatedAt: string;
};

async function read(organizationId: string): Promise<CompanySettingsDto> {
  const [row] = await db
    .select({ name: organization.name, settings: organizationSettings })
    .from(organizationSettings)
    .innerJoin(organization, eq(organization.id, organizationSettings.organizationId))
    .where(eq(organizationSettings.organizationId, organizationId))
    .limit(1);
  if (!row) throw new APIError("NOT_FOUND", { message: "Organization settings not found" });
  const { settings } = row;
  return {
    name: row.name,
    contactEmail: settings.contactEmail,
    contactPhone: settings.contactPhone,
    address: settings.address,
    defaultQuotationTerms: settings.defaultQuotationTerms,
    currency: settings.currency,
    timezone: settings.timezone,
    updatedAt: toIsoDto(settings.updatedAt),
  };
}

export async function getCompanySettings(params: { headers: Headers }): Promise<CompanySettingsDto> {
  const actor = await requirePermission({ headers: params.headers, permission: { organization: ["update"] } });
  return read(actor.organizationId);
}

export async function updateCompanySettings(params: {
  headers: Headers;
  expectedUpdatedAt: string;
  input: unknown;
}): Promise<CompanySettingsDto> {
  const actor = await requirePermission({ headers: params.headers, permission: { organization: ["update"] } });
  const input = inputSchema.parse(params.input);

  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({ updatedAt: organizationSettings.updatedAt })
      .from(organizationSettings)
      .where(eq(organizationSettings.organizationId, actor.organizationId))
      .for("update");
    if (!current) throw new APIError("NOT_FOUND", { message: "Organization settings not found" });
    // The wire value is millisecond-precise, Postgres keeps microseconds:
    // compare at the precision the client could have seen.
    if (toIsoDto(current.updatedAt) !== params.expectedUpdatedAt) {
      throw new APIError("CONFLICT", { message: "Settings were modified by someone else, reload" });
    }
    await tx
      .update(organization)
      .set({ name: input.name })
      .where(and(eq(organization.id, actor.organizationId)));
    await tx
      .update(organizationSettings)
      .set({
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        address: input.address,
        defaultQuotationTerms: input.defaultQuotationTerms,
      })
      .where(eq(organizationSettings.organizationId, actor.organizationId));
  });
  return read(actor.organizationId);
}
