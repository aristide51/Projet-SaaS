import { z } from "zod";

const nullableInteger = z.number().int().min(0).nullable();

export const categoryInputSchema = z.object({
  id: z.string().uuid().nullable(),
  parentId: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(80),
});

export const productInputSchema = z
  .object({
    id: z.string().uuid().nullable(),
    categoryId: z.string().uuid().nullable(),
    name: z.string().trim().min(1).max(160),
    description: z.string().max(4000),
    price: z.number().int().min(0).max(2_147_483_647),
    compareAtPrice: nullableInteger,
    sku: z.string().max(60),
    compatibility: z.string().max(500),
    stock: nullableInteger,
    status: z.enum(["available", "out_of_stock", "hidden"]),
    variants: z.array(
      z.object({
        id: z.string().uuid().nullable(),
        name: z.string().trim().min(1).max(80),
        price: nullableInteger,
        stock: nullableInteger,
      }),
    ),
  })
  .refine(
    (input) =>
      input.compareAtPrice === null || input.compareAtPrice > input.price,
    { path: ["compareAtPrice"] },
  );

export const serviceInputSchema = z.object({
  id: z.string().uuid().nullable(),
  name: z.string().trim().min(1).max(160),
  description: z.string().max(4000),
  durationMin: z.number().int().min(5).max(480),
  price: z.number().int().min(0).max(2_147_483_647),
  depositAmount: z.number().int().min(0).max(2_147_483_647),
  active: z.boolean(),
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type ProductInput = z.infer<typeof productInputSchema>;
export type ServiceInput = z.infer<typeof serviceInputSchema>;
