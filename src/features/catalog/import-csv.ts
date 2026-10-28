"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { logError } from "@/lib/monitoring/sentry";
import { createClient, getUser } from "@/lib/supabase/server";
import { csvRowSchema, type CsvRowInput } from "./import-csv-schema";

type ImportCsvResult =
  | {
      success: true;
      message: string;
      imported: number;
    }
  | { success: false; message: string };

type ImportCapacityResult =
  { success: true } | { success: false; message: string };

const MAX_IMPORT_ROWS = 500;
const MAX_BATCH_ROWS = 50;

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

  if (!member || (member.role !== "owner" && permissions.catalog !== true)) {
    return { error: "Tu n’as pas le droit de gérer ce catalogue." };
  }

  return { supabase };
}

async function getRemainingSlots(
  shopId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ remaining: number | null } | { error: string }> {
  const { count: existingCount, error: countError } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("shop_id", shopId)
    .eq("is_sample", false)
    .is("deleted_at", null);

  if (countError) {
    await logError("catalog_csv_count_failed", countError);
    return { error: "Impossible de vérifier la limite de produits." };
  }

  const { data: maxProducts, error: limitError } = await supabase.rpc(
    "catalog_product_limit",
    { p_shop: shopId },
  );

  if (limitError) {
    await logError("catalog_csv_limit_failed", limitError);
    return { error: "Impossible de vérifier la limite de ton plan." };
  }

  return {
    remaining:
      maxProducts === null
        ? null
        : Math.max(0, maxProducts - (existingCount ?? 0)),
  };
}

export async function checkCsvImportCapacity(
  shopId: string,
  rowCount: unknown,
): Promise<ImportCapacityResult> {
  if (
    typeof rowCount !== "number" ||
    !Number.isInteger(rowCount) ||
    rowCount < 1 ||
    rowCount > MAX_IMPORT_ROWS
  ) {
    return {
      success: false,
      message: "L’import doit contenir entre 1 et 500 produits valides.",
    };
  }

  try {
    const access = await getCatalogAccess(shopId);
    if ("error" in access) {
      return { success: false, message: access.error };
    }
    const capacity = await getRemainingSlots(shopId, access.supabase);
    if ("error" in capacity) {
      return { success: false, message: capacity.error };
    }
    if (capacity.remaining !== null && rowCount > capacity.remaining) {
      return {
        success: false,
        message: `Tu ne peux importer que ${capacity.remaining} produit(s) supplémentaire(s) avec ton plan actuel (limite atteinte).`,
      };
    }
    return { success: true };
  } catch (error) {
    await logError("catalog_csv_capacity_failed", error);
    return {
      success: false,
      message: "Impossible de vérifier la capacité de ton catalogue.",
    };
  }
}

export async function importCsvProducts(
  shopId: string,
  input: unknown,
): Promise<ImportCsvResult> {
  const validatedRows = z
    .array(csvRowSchema)
    .min(1)
    .max(MAX_BATCH_ROWS)
    .safeParse(input);
  if (!validatedRows.success) {
    return failure("Chaque lot doit contenir entre 1 et 50 lignes valides.");
  }
  const rows: CsvRowInput[] = validatedRows.data;

  try {
    const access = await getCatalogAccess(shopId);
    if ("error" in access) return failure(access.error);
    const { supabase } = access;
    const capacity = await getRemainingSlots(shopId, supabase);
    if ("error" in capacity) {
      return failure(capacity.error);
    }
    if (capacity.remaining !== null && rows.length > capacity.remaining) {
      return failure(
        `Tu ne peux importer que ${capacity.remaining} produit(s) supplémentaire(s) avec ton plan actuel (limite atteinte).`,
      );
    }

    const { data: imported, error: importError } = await supabase.rpc(
      "import_catalog_product_batch",
      {
        p_shop: shopId,
        p_products: rows,
      },
    );

    if (importError || imported !== rows.length) {
      if (importError) {
        await logError("catalog_csv_batch_failed", importError);
      }
      if (importError?.message.includes("plan_limit_products")) {
        const capacityAfterFailure = await getRemainingSlots(shopId, supabase);
        if ("error" in capacityAfterFailure) {
          return failure(capacityAfterFailure.error);
        }
        return failure(
          capacityAfterFailure.remaining === null
            ? "La capacité du catalogue a changé. Actualise la page puis réessaie."
            : `Tu ne peux importer que ${capacityAfterFailure.remaining} produit(s) supplémentaire(s) sur ton plan actuel. Consulte Abonnement pour voir les autres plans.`,
        );
      }
      return failure(
        "Ce lot n’a pas pu être enregistré. Aucun produit du lot n’a été importé.",
      );
    }

    revalidatePath("/dashboard/catalog");
    return {
      success: true,
      message: `${imported} produit(s) importé(s) avec succès.`,
      imported,
    };
  } catch (error) {
    await logError("catalog_csv_import_failed", error);
    return failure("L’import CSV a échoué. Vérifie le fichier et réessaie.");
  }
}
