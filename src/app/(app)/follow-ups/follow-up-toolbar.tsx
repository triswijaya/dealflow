"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { FOLLOW_UP_TYPES, ROLE_LABEL, type Role } from "@/lib/labels";
import type { AssignableMemberDto } from "@/server/deals/deal-views";

/** Type, assigned sales and a schedule date range, all in the URL (FILTER-01). */
export function FollowUpToolbar({
  type,
  assignedToId,
  from,
  to,
  members,
}: {
  type: string;
  assignedToId: string;
  from?: string;
  to?: string;
  members: AssignableMemberDto[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const rangeInvalid = Boolean(from && to && from > to);

  function push(changes: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("page");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }

  const active = Boolean(type || assignedToId || from || to);
  return (
    <div className="toolbar">
      <Field label="Tipe" htmlFor="followup-filter-type">
        <Select id="followup-filter-type" value={type} onChange={(event) => push({ type: event.target.value })}>
          <option value="">Semua</option>
          {FOLLOW_UP_TYPES.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Assigned sales" htmlFor="followup-filter-sales">
        <Select id="followup-filter-sales" value={assignedToId} onChange={(event) => push({ sales: event.target.value })}>
          <option value="">Semua</option>
          {members.map((member) => (
            <option key={member.userId} value={member.userId}>
              {member.name} · {ROLE_LABEL[member.role as Role] ?? member.role}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Sejak" htmlFor="followup-filter-from" error={rangeInvalid ? "Tanggal awal tidak boleh setelah tanggal akhir." : undefined}>
        <Input id="followup-filter-from" type="date" value={from ?? ""} max={to || undefined} invalid={rangeInvalid} onChange={(event) => push({ from: event.target.value })} />
      </Field>
      <Field label="Sampai" htmlFor="followup-filter-to">
        <Input id="followup-filter-to" type="date" value={to ?? ""} min={from || undefined} onChange={(event) => push({ to: event.target.value })} />
      </Field>
      {active ? (
        <Button variant="tertiary" onClick={() => push({ type: undefined, sales: undefined, from: undefined, to: undefined })}>
          Reset filter
        </Button>
      ) : null}
    </div>
  );
}
