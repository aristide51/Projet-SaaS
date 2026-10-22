"use server";

import { revalidatePath } from "next/cache";
import { logError } from "@/lib/monitoring/sentry";
import { createClient, getUser } from "@/lib/supabase/server";
import {
  csvRowSchema,
  type CsvRowInput,
  type CsvRowResult,
} from "./import-csv-schema";

type ImportCsvResult =
  | {
      success: true;
      message: string;
      imported: number;
      skipped: number;
    }
  | { success: false; message: string };

function failure(message: string): ImportCsvResult {
  return { success: false, message };
}

async function getCatalogAccess(shopId: string) {
  const user = await getUser();
  if (!user?.email_confirmed_at) {
    return { error: "Connecte-toi avec une adresse e-mail confirmée." };
  }

  const supabase = await createClient();
  const { data: member, error } = await supabase
    .from("shop_members")
    .select("role, permissions")
    .eq("shop_id", shopId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    throw new Error("Impossible de vérifier tes droits sur cette boutique.", {
      cause: error,
    });
  }

  const permissions =
    typeof member?.permissions === "object" &&
    member.permissions !== null &&
    !Array.isArray(member.permissions)
      ? member.permissions
      : {};

export async function importCsvProducts(
  shopId: string,
  rows: CsvRowInput[],
): Promise<ImportCsvResult> {
  const BATCH_SIZE = 50;
  let imported = 0;
  let skipped = 0;

  try {
    const access = await getCatalogAccess(shopId);
    if ("error" in access) return failure(access.error);
    const { supabase } = access;

    const { data: existingCount, error: countError } = await supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("is_sample", false)
      .is("deleted_at", null);

    if (countError) {
      await logError("catalog_csv_count_failed", countError);
      return failure("Impossible de vérifier la limite de produits.");
    }

    const { data: limitData, error: limitError } = await supabase.rpc(
      "catalog_product_limit",
      { p_shop: shopId },
    );

    if (limitError) {
      await logError("catalog_csv_limit_failed", limitError);
      return failure("Impossible de vérifier la limite de ton plan.");
    }

    const maxProducts = limitData as number | null;
    const remainingSlots =
      maxProducts !== null ? Math.max(0, maxProducts - (existingCount.count ?? 0)) : null;

    if (remainingSlots !== null && rows.length > remainingSlots) {
      return failure(
        `Tu ne peux importer que ${remainingSlots} produit(s) supplémentaire(s) avec ton plan actuel (limite atteinte).`,
      );
    }

    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);

      for (const row of batch) {
        if (remainingSlots !== null && imported >= remainingSlots) {
          skipped += 1;
          continue;
        }

        const variantsPayload = row.variant_name
          ? JSON.stringify([
              {
                name: row.variant_name,
                price: row.variant_price ?? null,
                stock: row.variant_stock ?? null,
              },
            ])
          : JSON.stringify([]);

        const { error: rpcError } = await supabase.rpc("save_catalog_product", {
          p_shop: shopId,
          p_product_id: null,
          p_category_id: null,
          p_name: row.name,
          p_description: row.description,
          p_price: row.price,
          p_compare_at_price: row.compare_at_price ?? null,
          p_sku: row.sku || null,
          p_compatibility: row.compatibility || null,
          p_stock: row.stock ?? null,
          p_status: row.status,
          p_variants: variantsPayload,
        });

        if (rpcError) {
          await logError("catalog_csv_product_failed", rpcError);
          skipped += 1;
          if (rpcError.message?.includes("plan_limit_products")) {
            break;
          }
          continue;
        }

        imported += 1;
      }

      if (remainingSlots !== null && imported >= remainingSlots) {
        skipped += rows.length - i - BATCH_SIZE;
        break;
      }
    }

    revalidatePath("/dashboard/catalog");

    if (skipped > 0 && imported > 0) {
      return {
        success: true,
        message: `${imported} produit(s) importé(s), ${skipped} produit(s) ignoré(s) (limite de plan ou erreur).`,
        imported,
        skipped,
      };
    }

    if (skipped > 0) {
      return {
        success: true,
        message: `${skipped} produit(s) ignoré(s) (limite de plan atteinte).`,
        imported,
        skipped,
      };
    }

    return {
      success: true,
      message: `${imported} produit(s) importé(s) avec succès.`,
      imported,
      skipped,
    };
  } catch (error) {
    await logError("catalog_csv_import_failed", error);
    return failure("L’import CSV a échoué. Vérifie le fichier et réessaie.");
  }
}

export async function validateCsvRows(
  rows: Record<string, string>[],
): Promise<{ valid: CsvRowInput[]; invalid: CsvRowResult[] }> {
  const valid: CsvRowInput[] = [];
  const invalid: CsvRowResult[] = [];

  rows.forEach((row, index) => {
    const result = csvRowSchema.safeParse(row);
    if (result.success) {
      valid.push(result.data);
    } else {
      invalid.push({
        kind: "invalid",
        rowIndex: index + 2,
        row,
        errors: result.error.issues.map((issue) => issue.message),
      });
    }
  });

  return { valid, invalid };
}

  if (!member || (member.role !== "owner" && permissions.catalog !== true)) {
    return { error: "Tu n’as pas le droit de gérer ce catalogue." };
  }

  return { supabase, userId: user.id };
}