import { describe, expect, it } from "vitest";
import {
  ACTIVE_DEAL_STAGES,
  DEAL_STAGE,
  DEAL_STAGES,
  NEXT_DEAL_STAGE,
  followUpTypeLabel,
  isActiveStage,
  lostReasonLabel,
  paymentMethodLabel,
} from "./labels";

describe("deal stages", () => {
  it("gives every stage a label and a tone", () => {
    for (const stage of DEAL_STAGES) {
      expect(DEAL_STAGE[stage].label).not.toBe("");
      expect(DEAL_STAGE[stage].tone).toBeTruthy();
    }
  });

  it("moves one step forward at a time, from PROSPECT through every active stage to WON (DEAL-03)", () => {
    const path: string[] = ["PROSPECT"];
    let stage = NEXT_DEAL_STAGE.PROSPECT;
    while (true) {
      path.push(stage.to);
      if (!isActiveStage(stage.to)) break;
      stage = NEXT_DEAL_STAGE[stage.to];
    }
    expect(path).toEqual([...ACTIVE_DEAL_STAGES, "WON"]);
  });

  it("treats WON and LOST as closed", () => {
    expect(isActiveStage("PROPOSAL")).toBe(true);
    expect(isActiveStage("WON")).toBe(false);
    expect(isActiveStage("LOST")).toBe(false);
    expect(isActiveStage("anything else")).toBe(false);
  });
});

describe("label lookups", () => {
  it("resolves known codes", () => {
    expect(lostReasonLabel("PRICE_TOO_HIGH")).toBe("Harga terlalu tinggi");
    expect(followUpTypeLabel("WHATSAPP")).toBe("WhatsApp");
    expect(paymentMethodLabel("BANK_TRANSFER")).toBe("Transfer bank");
  });

  it("falls back to 'Lainnya' for null or unknown codes", () => {
    expect(lostReasonLabel(null)).toBe("Lainnya");
    expect(lostReasonLabel("NOT_A_REASON")).toBe("Lainnya");
    expect(followUpTypeLabel("PIGEON")).toBe("Lainnya");
    expect(paymentMethodLabel("BARTER")).toBe("Lainnya");
  });
});
