import { describe, expect, it } from "vitest";
import { progressOrderSchema, refundOrderSchema } from "./schemas";

const orderId = "00000000-0000-4000-8000-000000000001";

describe("progressOrderSchema", () => {
  it.each(["confirmed", "ready", "completed"])(
    "accepte l’étape %s",
    (nextStatus) => {
      expect(
        progressOrderSchema.safeParse({ orderId, nextStatus }).success,
      ).toBe(true);
    },
  );

  it("refuse les transitions non prévues ou les identifiants invalides", () => {
    expect(
      progressOrderSchema.safeParse({
        orderId,
        nextStatus: "cancelled",
      }).success,
    ).toBe(false);
    expect(
      progressOrderSchema.safeParse({
        orderId: "not-a-uuid",
        nextStatus: "ready",
      }).success,
    ).toBe(false);
  });
});

describe("refundOrderSchema", () => {
  it("permet les remboursements sans référence hors USSD", () => {
    expect(refundOrderSchema.safeParse({ orderId }).success).toBe(true);
  });

  it("valide une référence facultative de remboursement", () => {
    expect(
      refundOrderSchema.safeParse({
        orderId,
        refundReference: "REFUND-1234",
      }).success,
    ).toBe(true);
    expect(
      refundOrderSchema.safeParse({
        orderId,
        refundReference: "x".repeat(41),
      }).success,
    ).toBe(false);
  });
});
