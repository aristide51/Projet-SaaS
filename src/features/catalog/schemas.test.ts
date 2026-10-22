import { describe, expect, it } from "vitest";
import {
  categoryInputSchema,
  productInputSchema,
  serviceInputSchema,
} from "./schemas";

describe("catalog input schemas", () => {
  it("requires whole FCFA prices and compare-at price greater than price", () => {
    const product = {
      id: null,
      categoryId: null,
      name: "Pneu",
      description: "",
      price: 12000,
      compareAtPrice: 15000,
      sku: "",
      compatibility: "",
      stock: null,
      status: "available",
      variants: [],
    };

    expect(productInputSchema.safeParse(product).success).toBe(true);
    expect(
      productInputSchema.safeParse({
        ...product,
        price: 12000.5,
      }).success,
    ).toBe(false);
    expect(
      productInputSchema.safeParse({
        ...product,
        compareAtPrice: 11000,
      }).success,
    ).toBe(false);
  });

  it("validates variant stock, category names and service deposits", () => {
    expect(
      productInputSchema.safeParse({
        id: null,
        categoryId: null,
        name: "Pneu",
        description: "",
        price: 12000,
        compareAtPrice: null,
        sku: "",
        compatibility: "",
        stock: null,
        status: "available",
        variants: [{ id: null, name: "Modèle 1", price: 12000, stock: -1 }],
      }).success,
    ).toBe(false);
    expect(
      categoryInputSchema.safeParse({
        id: null,
        parentId: null,
        name: "   ",
      }).success,
    ).toBe(false);
    expect(
      serviceInputSchema.safeParse({
        id: null,
        name: "Vidange",
        description: "",
        durationMin: 60,
        price: 15000,
        depositAmount: 5000,
        active: true,
      }).success,
    ).toBe(true);
    expect(
      serviceInputSchema.safeParse({
        id: null,
        name: "Vidange",
        description: "",
        durationMin: 4,
        price: 15000,
        depositAmount: 5000,
        active: true,
      }).success,
    ).toBe(false);
  });
});
