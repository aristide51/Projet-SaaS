import { z } from "zod";

export const csvRowSchema = z
  .object({
    name: z.string().trim().min(1, "Le nom est requis").max(160),
    description: z.string().max(4000).optional().default(""),
    price: z
      .string()
      .trim()
      .regex(/^\d+$/, "Le prix doit être un entier en FCFA")
      .transform((value) => parseInt(value, 10)),
    compare_at_price: z
      .string()
      .trim()
      .regex(/^\d+$/, "Le prix barré doit être un entier en FCFA")
      .transform((value) => parseInt(value, 10))
      .optional()
      .nullable(),
    sku: z.string().trim().max(60).optional().default(""),
    compatibility: z.string().trim().max(500).optional().default(""),
    stock: z
      .string()
      .trim()
      .regex(/^\d+$/, "Le stock doit être un entier")
      .transform((value) => (value === "" ? null : parseInt(value, 10)))
      .optional()
      .nullable(),
    status: z
      .enum(["available", "out_of_stock", "hidden"])
      .optional()
      .default("available"),
    category_name: z.string().trim().max(80).optional().default(""),
    variant_name: z.string().trim().max(80).optional().default(""),
    variant_price: z
      .string()
      .trim()
      .regex(/^\d+$/, "Le prix de la variante doit être un entier en FCFA")
      .transform((value) => (value === "" ? null : parseInt(value, 10)))
      .optional()
      .nullable(),
    variant_stock: z
      .string()
      .trim()
      .regex(/^\d+$/, "Le stock de la variante doit être un entier")
      .transform((value) => (value === "" ? null : parseInt(value, 10)))
      .optional()
      .nullable(),
  })
  .refine(
    (data) =>
      data.compare_at_price === null ||
      data.compare_at_price === undefined ||
      data.compare_at_price > data.price,
    {
      path: ["compare_at_price"],
      message: "Le prix barré doit être supérieur au prix",
    },
  )
  .refine(
    (data) =>
      data.variant_price === null ||
      data.variant_price === undefined ||
      data.variant_price >= 0,
    {
      path: ["variant_price"],
      message: "Le prix de la variante doit être positif ou nul",
    },
  );

export type CsvRowInput = z.infer<typeof csvRowSchema>;

export type CsvRowResult =
  | {
      kind: "valid";
      row: CsvRowInput;
    }
  | {
      kind: "invalid";
      rowIndex: number;
      row: Record<string, string>;
      errors: string[];
    };

export function parseCsvRows(
  rows: Record<string, string>[],
): { valid: CsvRowInput[]; invalid: CsvRowResult[] } {
  const valid: CsvRowInput[] = [];
  const invalid: CsvRowResult[] = [];

  rows.forEach((row, index) => {
    const result = csvRowSchema.safeParse(row);
    if (result.success) {
      valid.push(result.data);
    } else {
      invalid.push({
        kind: "invalid",
        rowIndex: index + 2, // +2 pour l'en-tête et la base 1
        row,
        errors: result.error.issues.map((issue) => issue.message),
      });
    }
  });

  return { valid, invalid };
}

export const csvHeader = [
  "name",
  "description",
  "price",
  "compare_at_price",
  "sku",
  "compatibility",
  "stock",
  "status",
  "category_name",
  "variant_name",
  "variant_price",
  "variant_stock",
];

export function buildCsvTemplate(): string {
  const header = csvHeader.join(",");
  const example = [
    "Pneu Michelin 175/65 R14",
    "Pneu neuf pour citadine",
    "12000",
    "15000",
    "PNE-MIC-175",
    "Voitures citadines",
    "20",
    "available",
    "Pneumatiques",
    "",
    "",
    "",
  ];
  const escapedExample = example.map((v) => {
    if (v.includes(",") || v.includes('"') || v.includes("\n")) {
      return `"${v.replace(/"/g, '""')}"`;
    }
    return v;
  });
  return `${header}\n${escapedExample.join(",")}\n`;
}