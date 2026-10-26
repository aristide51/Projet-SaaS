"use server";

import { revalidatePath } from "next/cache";
import { logError } from "@/lib/monitoring/sentry";
import { createClient, getUser } from "@/lib/supabase/server";
import { revalidatePublicShop } from "@/features/storefront/cache";
import {
  categoryInputSchema,
  productInputSchema,
  serviceInputSchema,
} from "./schemas";
import { getSampleCatalog, sampleShopTypeSchema } from "./sample-products";

type CatalogActionResult =
  | {
      success: true;
      message: string;
      id?: string;
      variants?: {
        id: string;
        name: string;
        price: number | null;
        stock: number | null;
      }[];
    }
  | { success: false; message: string };

function failure(message: string): CatalogActionResult {
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

function messageForDatabaseError(message: string) {
  if (message.includes("plan_limit_products")) {
    return "La limite de 15 produits du plan Gratuit est atteinte. Passe à un plan supérieur ou mets un produit à la corbeille.";
  }
  if (message.includes("variant_in_cart")) {
    return "Cette variante est dans un panier. Retire-la du panier avant de la supprimer.";
  }
  if (message.includes("restoration_expired")) {
    return "Ce contenu a dépassé les 30 jours de conservation et ne peut plus être restauré.";
  }
  if (message.includes("forbidden")) {
    return "Tu n’as pas le droit de gérer ce catalogue.";
  }
  if (message.includes("category_id_fkey")) {
    return "La catégorie choisie n’appartient pas à cette boutique.";
  }
  if (message.includes("category_cycle")) {
    return "Une catégorie ne peut pas être son propre parent ou celui d’un de ses parents.";
  }
  return "L’enregistrement a échoué. Vérifie les informations et réessaie.";
}

export async function saveCategory(
  shopId: string,
  input: unknown,
): Promise<CatalogActionResult> {
  const parsed = categoryInputSchema.safeParse(input);
  if (!parsed.success) return failure("Vérifie le nom de la catégorie.");

  try {
    const access = await getCatalogAccess(shopId);
    if ("error" in access) return failure(access.error);
    const { supabase } = access;
    const category = parsed.data;
    const result = category.id
      ? await supabase
          .from("categories")
          .update({ name: category.name, parent_id: category.parentId })
          .eq("id", category.id)
          .eq("shop_id", shopId)
          .select("id")
          .maybeSingle()
      : await supabase
          .from("categories")
          .insert({
            shop_id: shopId,
            name: category.name,
            parent_id: category.parentId,
          })
          .select("id")
          .single();

    if (result.error || !result.data) {
      if (result.error) {
        await logError("catalog_category_save_failed", result.error);
      }
      return failure(
        result.error
          ? messageForDatabaseError(result.error.message)
          : "La catégorie n’a pas été trouvée.",
      );
    }

    revalidatePublicShop(shopId);
    revalidatePath("/dashboard/catalog");
    return { success: true, message: "Catégorie enregistrée." };
  } catch (error) {
    await logError("catalog_category_save_failed", error);
    return failure("La catégorie n’a pas pu être enregistrée. Réessaie.");
  }
}

export async function deleteCategory(
  shopId: string,
  categoryId: string,
): Promise<CatalogActionResult> {
  try {
    const access = await getCatalogAccess(shopId);
    if ("error" in access) return failure(access.error);
    const { data, error } = await access.supabase
      .from("categories")
      .delete()
      .eq("id", categoryId)
      .eq("shop_id", shopId)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      if (error) await logError("catalog_category_delete_failed", error);
      return failure(
        error
          ? "La catégorie n’a pas pu être supprimée. Réessaie."
          : "La catégorie n’a pas été trouvée.",
      );
    }

    revalidatePublicShop(shopId);
    revalidatePath("/dashboard/catalog");
    return { success: true, message: "Catégorie supprimée." };
  } catch (error) {
    await logError("catalog_category_delete_failed", error);
    return failure("La catégorie n’a pas pu être supprimée. Réessaie.");
  }
}

export async function saveProduct(
  shopId: string,
  input: unknown,
): Promise<CatalogActionResult> {
  const parsed = productInputSchema.safeParse(input);
  if (!parsed.success) {
    return failure("Vérifie le nom, le prix, le stock et les variantes.");
  }

  try {
    const access = await getCatalogAccess(shopId);
    if ("error" in access) return failure(access.error);
    const product = parsed.data;
    const { data, error } = await access.supabase.rpc("save_catalog_product", {
      p_shop: shopId,
      p_product: {
        id: product.id,
        category_id: product.categoryId,
        name: product.name,
        description: product.description,
        price: product.price,
        compare_at_price: product.compareAtPrice,
        sku: product.sku,
        compatibility: product.compatibility,
        stock: product.stock,
        status: product.status,
        variants: product.variants,
      },
    });

    if (error || !data) {
      if (error) await logError("catalog_product_save_failed", error);
      return failure(
        error
          ? messageForDatabaseError(error.message)
          : "Le produit n’a pas pu être enregistré. Réessaie.",
      );
    }

    const { data: variants, error: variantsError } = await access.supabase
      .from("product_variants")
      .select("id, name, price, stock")
      .eq("shop_id", shopId)
      .eq("product_id", data)
      .order("name");
    if (variantsError) {
      await logError("catalog_product_variants_reload_failed", variantsError);
      return failure(
        "Le produit est enregistré, mais ses variantes n’ont pas pu être rechargées. Actualise la page avant de modifier à nouveau.",
      );
    }

    revalidatePublicShop(shopId);
    revalidatePath("/dashboard/catalog");
    return {
      success: true,
      id: data,
      variants,
      message: product.id ? "Produit mis à jour." : "Produit ajouté.",
    };
  } catch (error) {
    await logError("catalog_product_save_failed", error);
    return failure("Le produit n’a pas pu être enregistré. Réessaie.");
  }
}

export async function saveService(
  shopId: string,
  input: unknown,
): Promise<CatalogActionResult> {
  const parsed = serviceInputSchema.safeParse(input);
  if (!parsed.success) {
    return failure("Vérifie le nom, le prix, la durée et l’acompte.");
  }

  try {
    const access = await getCatalogAccess(shopId);
    if ("error" in access) return failure(access.error);
    const service = parsed.data;
    if (service.depositAmount > service.price) {
      return failure("L’acompte ne peut pas dépasser le prix du service.");
    }

    const { data, error } = await access.supabase.rpc("save_catalog_service", {
      p_shop: shopId,
      p_service: {
        id: service.id,
        name: service.name,
        description: service.description,
        duration_min: service.durationMin,
        price: service.price,
        deposit_amount: service.depositAmount,
        active: service.active,
      },
    });

    if (error || !data) {
      if (error) await logError("catalog_service_save_failed", error);
      return failure(
        error
          ? messageForDatabaseError(error.message)
          : "Le service n’a pas pu être enregistré. Réessaie.",
      );
    }

    revalidatePublicShop(shopId);
    revalidatePath("/dashboard/catalog");
    return {
      success: true,
      id: data,
      message: service.id ? "Service mis à jour." : "Service ajouté.",
    };
  } catch (error) {
    await logError("catalog_service_save_failed", error);
    return failure("Le service n’a pas pu être enregistré. Réessaie.");
  }
}

export async function seedCatalogSamples(
  shopId: string,
  input: unknown,
): Promise<CatalogActionResult> {
  const parsed = sampleShopTypeSchema.safeParse(input);
  if (!parsed.success) {
    return failure("Choisis un type de commerce proposé.");
  }

  try {
    const access = await getCatalogAccess(shopId);
    if ("error" in access) return failure(access.error);
    const catalog = getSampleCatalog(parsed.data);
    const { error } = await access.supabase.rpc("seed_catalog_samples", {
      p_shop: shopId,
      p_catalog: {
        products: catalog.products,
        services: catalog.services,
      },
    });

    if (error) {
      await logError("catalog_sample_seed_failed", error);
      return failure(
        error.message.includes("sample_catalog_already_loaded")
          ? "Des exemples sont déjà présents dans ce catalogue."
          : "Les exemples n’ont pas pu être ajoutés. Réessaie.",
      );
    }

    revalidatePublicShop(shopId);
    revalidatePath("/dashboard/catalog");
    return {
      success: true,
      message:
        "Exemples ajoutés. Ils resteront invisibles sur ta vitrine tant que tu ne les auras pas modifiés.",
    };
  } catch (error) {
    await logError("catalog_sample_seed_failed", error);
    return failure("Les exemples n’ont pas pu être ajoutés. Réessaie.");
  }
}

export async function setCatalogItemDeleted(
  shopId: string,
  kind: "product" | "service",
  itemId: string,
  deleted: boolean,
): Promise<CatalogActionResult> {
  try {
    const access = await getCatalogAccess(shopId);
    if ("error" in access) return failure(access.error);
    const { error } = await access.supabase.rpc("set_catalog_item_deleted", {
      p_shop: shopId,
      p_kind: kind,
      p_item_id: itemId,
      p_deleted: deleted,
    });

    if (error) {
      await logError("catalog_item_archive_failed", error);
      return failure(messageForDatabaseError(error.message));
    }

    revalidatePublicShop(shopId);
    revalidatePath("/dashboard/catalog");
    return {
      success: true,
      message: deleted
        ? "Élément placé dans la corbeille."
        : "Élément restauré.",
    };
  } catch (error) {
    await logError("catalog_item_archive_failed", error);
    return failure("La modification n’a pas pu être enregistrée. Réessaie.");
  }
}

export async function uploadProductImage(
  shopId: string,
  productId: string,
  file: File,
): Promise<CatalogActionResult> {
  if (
    !(file instanceof File) ||
    file.size === 0 ||
    file.size > 5 * 1024 * 1024
  ) {
    return failure("Chaque image WebP doit peser 5 Mo maximum.");
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch (error) {
    await logError("catalog_image_upload_failed", error);
    return failure("Le contenu de l’image n’a pas pu être lu.");
  }
  const isWebp =
    file.type === "image/webp" &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;
  if (!isWebp) return failure("L’image doit être convertie au format WebP.");

  try {
    const access = await getCatalogAccess(shopId);
    if ("error" in access) return failure(access.error);
    const { data: product, error: productError } = await access.supabase
      .from("products")
      .select("id")
      .eq("id", productId)
      .eq("shop_id", shopId)
      .is("deleted_at", null)
      .maybeSingle();

    if (productError || !product) {
      if (productError)
        await logError("catalog_image_parent_check_failed", productError);
      return failure("Ce produit est introuvable.");
    }

    const { count, error: countError } = await access.supabase
      .from("product_images")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("product_id", productId);

    if (countError) {
      await logError("catalog_image_count_failed", countError);
      return failure("Les images du produit n’ont pas pu être chargées.");
    }

    const path = `${shopId}/products/${productId}/${crypto.randomUUID()}.webp`;
    const { error: uploadError } = await access.supabase.storage
      .from("shop-assets")
      .upload(path, file, { contentType: "image/webp", upsert: false });
    if (uploadError) {
      await logError("catalog_image_upload_failed", uploadError);
      return failure("L’image n’a pas pu être envoyée. Vérifie la connexion.");
    }

    const { error: imageError } = await access.supabase
      .from("product_images")
      .insert({
        shop_id: shopId,
        product_id: productId,
        path,
        position: count ?? 0,
      });

    if (imageError) {
      await logError("catalog_image_record_failed", imageError);
      const { error: cleanupError } = await access.supabase.storage
        .from("shop-assets")
        .remove([path]);
      if (cleanupError) {
        await logError("catalog_image_cleanup_failed", cleanupError);
      }
      return failure("L’image a été envoyée mais n’a pas pu être associée.");
    }

    revalidatePublicShop(shopId);
    revalidatePath("/dashboard/catalog");
    return { success: true, message: "Image ajoutée." };
  } catch (error) {
    await logError("catalog_image_upload_failed", error);
    return failure("L’image n’a pas pu être envoyée. Réessaie.");
  }
}

export async function deleteProductImage(
  shopId: string,
  productId: string,
  imageId: string,
): Promise<CatalogActionResult> {
  try {
    const access = await getCatalogAccess(shopId);
    if ("error" in access) return failure(access.error);
    const { data: image, error: imageError } = await access.supabase
      .from("product_images")
      .select("id, path")
      .eq("id", imageId)
      .eq("shop_id", shopId)
      .eq("product_id", productId)
      .maybeSingle();

    if (
      imageError ||
      !image ||
      !image.path.startsWith(`${shopId}/products/${productId}/`)
    ) {
      if (imageError) await logError("catalog_image_lookup_failed", imageError);
      return failure("Cette image est introuvable.");
    }

    const { error: storageError } = await access.supabase.storage
      .from("shop-assets")
      .remove([image.path]);
    if (storageError) {
      await logError("catalog_image_delete_failed", storageError);
      return failure("L’image du stockage n’a pas pu être supprimée.");
    }

    const { error } = await access.supabase
      .from("product_images")
      .delete()
      .eq("id", imageId)
      .eq("shop_id", shopId);
    if (error) {
      await logError("catalog_image_record_delete_failed", error);
      return failure(
        "Le fichier est supprimé mais son entrée n’a pas pu être retirée.",
      );
    }

    revalidatePublicShop(shopId);
    revalidatePath("/dashboard/catalog");
    return { success: true, message: "Image supprimée." };
  } catch (error) {
    await logError("catalog_image_delete_failed", error);
    return failure("L’image n’a pas pu être supprimée. Réessaie.");
  }
}

export async function reorderProductImages(
  shopId: string,
  productId: string,
  imageIds: string[],
): Promise<CatalogActionResult> {
  try {
    const access = await getCatalogAccess(shopId);
    if ("error" in access) return failure(access.error);
    const { data: images, error: fetchError } = await access.supabase
      .from("product_images")
      .select("id, path")
      .eq("shop_id", shopId)
      .eq("product_id", productId);
    if (fetchError) {
      await logError("catalog_image_reorder_failed", fetchError);
      return failure("L’ordre des images n’a pas pu être enregistré.");
    }

    if (
      images.length !== imageIds.length ||
      new Set(imageIds).size !== imageIds.length ||
      !imageIds.every((id) => images.some((image) => image.id === id))
    ) {
      return failure(
        "La liste d’images a changé. Recharge la page et réessaie.",
      );
    }

    for (const [position, id] of imageIds.entries()) {
      const { error } = await access.supabase
        .from("product_images")
        .update({ position })
        .eq("id", id)
        .eq("shop_id", shopId)
        .eq("product_id", productId);
      if (error) {
        await logError("catalog_image_reorder_failed", error);
        return failure("L’ordre des images n’a pas pu être enregistré.");
      }
    }

    revalidatePublicShop(shopId);
    revalidatePath("/dashboard/catalog");
    return { success: true, message: "Ordre des images enregistré." };
  } catch (error) {
    await logError("catalog_image_reorder_failed", error);
    return failure("L’ordre des images n’a pas pu être enregistré.");
  }
}

export async function uploadServiceImage(
  shopId: string,
  serviceId: string,
  file: File,
): Promise<CatalogActionResult> {
  if (
    !(file instanceof File) ||
    file.size === 0 ||
    file.size > 5 * 1024 * 1024
  ) {
    return failure("Chaque image WebP doit peser 5 Mo maximum.");
  }

  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch (error) {
    await logError("catalog_image_upload_failed", error);
    return failure("Le contenu de l’image n’a pas pu être lu.");
  }
  if (
    file.type !== "image/webp" ||
    bytes[0] !== 0x52 ||
    bytes[1] !== 0x49 ||
    bytes[2] !== 0x46 ||
    bytes[3] !== 0x46 ||
    bytes[8] !== 0x57 ||
    bytes[9] !== 0x45 ||
    bytes[10] !== 0x42 ||
    bytes[11] !== 0x50
  ) {
    return failure("L’image doit être convertie au format WebP.");
  }

  try {
    const access = await getCatalogAccess(shopId);
    if ("error" in access) return failure(access.error);
    const { data: service, error: serviceError } = await access.supabase
      .from("services")
      .select("id")
      .eq("id", serviceId)
      .eq("shop_id", shopId)
      .is("deleted_at", null)
      .maybeSingle();
    if (serviceError || !service) {
      if (serviceError) {
        await logError("catalog_image_parent_check_failed", serviceError);
      }
      return failure("Ce service est introuvable.");
    }

    const { count, error: countError } = await access.supabase
      .from("service_images")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shopId)
      .eq("service_id", serviceId);
    if (countError) {
      await logError("catalog_image_count_failed", countError);
      return failure("Les images du service n’ont pas pu être chargées.");
    }

    const path = `${shopId}/services/${serviceId}/${crypto.randomUUID()}.webp`;
    const { error: uploadError } = await access.supabase.storage
      .from("shop-assets")
      .upload(path, file, { contentType: "image/webp", upsert: false });
    if (uploadError) {
      await logError("catalog_image_upload_failed", uploadError);
      return failure("L’image n’a pas pu être envoyée. Vérifie la connexion.");
    }
    const { error: recordError } = await access.supabase
      .from("service_images")
      .insert({
        shop_id: shopId,
        service_id: serviceId,
        path,
        position: count ?? 0,
      });
    if (recordError) {
      await logError("catalog_image_record_failed", recordError);
      const { error: cleanupError } = await access.supabase.storage
        .from("shop-assets")
        .remove([path]);
      if (cleanupError) {
        await logError("catalog_image_cleanup_failed", cleanupError);
      }
      return failure("L’image a été envoyée mais n’a pas pu être associée.");
    }
    revalidatePublicShop(shopId);
    revalidatePath("/dashboard/catalog");
    return { success: true, message: "Photo de service ajoutée." };
  } catch (error) {
    await logError("catalog_image_upload_failed", error);
    return failure("L’image n’a pas pu être envoyée. Réessaie.");
  }
}

export async function deleteServiceImage(
  shopId: string,
  serviceId: string,
  imageId: string,
): Promise<CatalogActionResult> {
  try {
    const access = await getCatalogAccess(shopId);
    if ("error" in access) return failure(access.error);
    const { data: image, error: imageError } = await access.supabase
      .from("service_images")
      .select("id, path")
      .eq("id", imageId)
      .eq("shop_id", shopId)
      .eq("service_id", serviceId)
      .maybeSingle();
    if (
      imageError ||
      !image ||
      !image.path.startsWith(`${shopId}/services/${serviceId}/`)
    ) {
      if (imageError) await logError("catalog_image_lookup_failed", imageError);
      return failure("Cette image est introuvable.");
    }
    const { error: storageError } = await access.supabase.storage
      .from("shop-assets")
      .remove([image.path]);
    if (storageError) {
      await logError("catalog_image_delete_failed", storageError);
      return failure("L’image du stockage n’a pas pu être supprimée.");
    }
    const { error } = await access.supabase
      .from("service_images")
      .delete()
      .eq("id", imageId)
      .eq("shop_id", shopId);
    if (error) {
      await logError("catalog_image_record_delete_failed", error);
      return failure(
        "Le fichier est supprimé mais son entrée n’a pas pu être retirée.",
      );
    }
    revalidatePublicShop(shopId);
    revalidatePath("/dashboard/catalog");
    return { success: true, message: "Photo de service supprimée." };
  } catch (error) {
    await logError("catalog_image_delete_failed", error);
    return failure("L’image n’a pas pu être supprimée. Réessaie.");
  }
}

export async function reorderServiceImages(
  shopId: string,
  serviceId: string,
  imageIds: string[],
): Promise<CatalogActionResult> {
  try {
    const access = await getCatalogAccess(shopId);
    if ("error" in access) return failure(access.error);
    const { data: images, error: fetchError } = await access.supabase
      .from("service_images")
      .select("id")
      .eq("shop_id", shopId)
      .eq("service_id", serviceId);
    if (fetchError) {
      await logError("catalog_image_reorder_failed", fetchError);
      return failure("L’ordre des images n’a pas pu être enregistré.");
    }
    if (
      images.length !== imageIds.length ||
      new Set(imageIds).size !== imageIds.length ||
      !imageIds.every((id) => images.some((image) => image.id === id))
    ) {
      return failure(
        "La liste d’images a changé. Recharge la page et réessaie.",
      );
    }
    for (const [position, id] of imageIds.entries()) {
      const { error } = await access.supabase
        .from("service_images")
        .update({ position })
        .eq("id", id)
        .eq("shop_id", shopId)
        .eq("service_id", serviceId);
      if (error) {
        await logError("catalog_image_reorder_failed", error);
        return failure("L’ordre des images n’a pas pu être enregistré.");
      }
    }
    revalidatePublicShop(shopId);
    revalidatePath("/dashboard/catalog");
    return { success: true, message: "Ordre des photos enregistré." };
  } catch (error) {
    await logError("catalog_image_reorder_failed", error);
    return failure("L’ordre des images n’a pas pu être enregistré.");
  }
}
