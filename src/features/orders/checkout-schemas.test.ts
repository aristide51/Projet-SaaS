import { describe, expect, it } from "vitest";
import { checkoutInputSchema } from "./checkout-schemas";

const checkoutInput = {
  cartId: "00000000-0000-4000-8000-000000000001",
  paymentMethod: "ussd_orange",
  fulfillment: "pickup",
};

describe("checkoutInputSchema", () => {
  it("accepte un paiement et un retrait valides", () => {
    expect(checkoutInputSchema.safeParse(checkoutInput).success).toBe(true);
  });

  it("permet de calculer un aperçu avant la saisie de l’adresse", () => {
    expect(
      checkoutInputSchema.safeParse({
        ...checkoutInput,
        fulfillment: "delivery",
      }).success,
    ).toBe(true);
  });

  it("borne l’adresse, la note et le code promo", () => {
    expect(
      checkoutInputSchema.safeParse({
        ...checkoutInput,
        deliveryAddress: "A".repeat(301),
      }).success,
    ).toBe(false);
    expect(
      checkoutInputSchema.safeParse({
        ...checkoutInput,
        note: "A".repeat(501),
      }).success,
    ).toBe(false);
    expect(
      checkoutInputSchema.safeParse({
        ...checkoutInput,
        couponCode: "A".repeat(25),
      }).success,
    ).toBe(false);
  });

  it("refuse les modes de paiement inconnus et les champs inattendus", () => {
    expect(
      checkoutInputSchema.safeParse({
        ...checkoutInput,
        paymentMethod: "invented",
      }).success,
    ).toBe(false);
    expect(
      checkoutInputSchema.safeParse({
        ...checkoutInput,
        total: 1,
      }).success,
    ).toBe(false);
  });
});
