"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { DealForm, type DealFormProps } from "../deal-form";

/** The create form as a full page, for links that arrive with a customer already chosen. */
export function NewDealForm(props: Omit<DealFormProps, "onClose" | "deal" | "closeOnCreate">) {
  const router = useRouter();
  return (
    <Card style={{ maxWidth: 820 }}>
      <DealForm {...props} onClose={() => router.back()} closeOnCreate={false} />
    </Card>
  );
}
