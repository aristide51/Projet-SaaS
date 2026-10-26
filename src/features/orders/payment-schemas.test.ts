import { describe, expect, it } from "vitest";
import { paymentDeclarationSchema } from "./payment-schemas";

describe("paymentDeclarationSchema", () => {
  it("normalise le numéro burkinabè et la référence", () => {
    expect(
      paymentDeclarationSchema.parse({
        orderId: "00000000-0000-4000-8000-000000000001",
        payerPhone: "70 00 00 00",
        transactionReference: "ab12.cd34",
      }),
    ).toMatchObject({
      payerPhone: "+22670000000",
      transactionReference: "AB12.CD34",
    });
  });

  it("refuse un numéro invalide ou une référence trop courte", () => {
    expect(
      paymentDeclarationSchema.safeParse({
        orderId: "00000000-0000-4000-8000-000000000001",
        payerPhone: "12",
        transactionReference: "AB12",
      }).success,
    ).toBe(false);
    expect(
      paymentDeclarationSchema.safeParse({
        orderId: "00000000-0000-4000-8000-000000000001",
        payerPhone: "+22670000000",
        transactionReference: "X",
      }).success,
    ).toBe(false);
  });
});
