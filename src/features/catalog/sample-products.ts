import { z } from "zod";
import autoPartsCatalog from "./samples/auto_parts.json";
import garageCatalog from "./samples/garage.json";
import hardwareCatalog from "./samples/hardware.json";
import salonCatalog from "./samples/salon.json";

export const SAMPLE_SHOP_TYPES = [
  "hardware",
  "auto_parts",
  "garage",
  "salon",
] as const;

export const sampleShopTypeSchema = z.enum(SAMPLE_SHOP_TYPES);
export type SampleShopType = z.infer<typeof sampleShopTypeSchema>;

const sampleProductSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(4000),
  price: z.number().int().nonnegative(),
  compare_at_price: z.number().int().nonnegative().nullable(),
  sku: z.string().max(60).nullable(),
  compatibility: z.string().max(500).nullable(),
  stock: z.number().int().nonnegative().nullable(),
  status: z.enum(["available", "out_of_stock", "hidden"]),
  category_name: z.string().min(1).max(80),
  variant_name: z.string().max(80).nullable(),
  variant_price: z.number().int().nonnegative().nullable(),
  variant_stock: z.number().int().nonnegative().nullable(),
});

const sampleServiceSchema = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(4000),
  duration_min: z.number().int().min(5).max(480),
  price: z.number().int().nonnegative(),
  deposit_amount: z.number().int().nonnegative(),
});

const sampleCatalogSchema = z.object({
  shopType: sampleShopTypeSchema,
  title: z.string().min(1),
  products: z.array(sampleProductSchema),
  services: z.array(sampleServiceSchema),
});

export type SampleProduct = z.infer<typeof sampleProductSchema>;
export type SampleService = z.infer<typeof sampleServiceSchema>;
export type SampleCatalog = z.infer<typeof sampleCatalogSchema>;

export const SAMPLE_CATALOGS: Record<SampleShopType, SampleCatalog> = {
  hardware: sampleCatalogSchema.parse(hardwareCatalog),
  auto_parts: sampleCatalogSchema.parse(autoPartsCatalog),
  garage: sampleCatalogSchema.parse(garageCatalog),
  salon: sampleCatalogSchema.parse(salonCatalog),
};

export function getSampleCatalog(shopType: SampleShopType): SampleCatalog {
  return SAMPLE_CATALOGS[shopType];
}
