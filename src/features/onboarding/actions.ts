"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { expirePublicShopIndex } from "@/features/storefront/cache";
import { logError } from "@/lib/monitoring/sentry";
import { createClient, getUser } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database";
import {
  hasCompleteOpeningHours,
  onboardingPaymentMethodsSchema,
  saveOnboardingSchema,
  validBrandColorSchema,
  validPhoneSchema,
  validShopSlugSchema,
} from "./schemas";

export type OnboardingActionResult =
  | {
      success: true;
      message: string;
      shopId?: string;
      path?: string;
      publicUrl?: string;
    }
  | { success: false; message: string };

function failure(message: string): OnboardingActionResult {
  return { success: false, message };
}

async function getVerifiedOwner() {
  const user = await getUser();

  if (!user?.email_confirmed_at) {
    return null;
  }

  return user;
}

async function userOwnsShop(shopId: string, userId: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("shops")
    .select("id")
    .eq("id", shopId)
    .eq("created_by", userId)
    .maybeSingle();

  if (error) {
    throw new Error("Impossible de vérifier la boutique.", { cause: error });
  }

  return Boolean(data);
}

export async function createOnboardingShop(): Promise<OnboardingActionResult> {
  try {
    const user = await getVerifiedOwner();

    if (!user) {
      return failure("Connecte-toi avec une adresse e-mail confirmée.");
    }

    const supabase = await createClient();
    const uniqueId = crypto.randomUUID().replaceAll("-", "").slice(0, 8);
    const { data, error } = await supabase
      .from("shops")
      .insert({
        created_by: user.id,
        name: "Nouvelle boutique",
        slug: `boutique-${uniqueId}`,
      })
      .select("id")
      .single();

    if (error) {
      await logError("shop_onboarding_create_failed", error);
      return failure("La création de ta boutique a échoué. Réessaie.");
    }

    revalidatePath("/dashboard");
    revalidatePath("/dashboard/onboarding");
    return {
      success: true,
      message: "Ta boutique est prête à être configurée.",
      shopId: data.id,
    };
  } catch (error) {
    await logError("shop_onboarding_create_failed", error);
    return failure("La création de ta boutique a échoué. Réessaie.");
  }
}

export async function checkShopSlugAvailability(
  slug: string,
  shopId: string,
): Promise<OnboardingActionResult> {
  const parsedSlug = validShopSlugSchema.safeParse(slug);

  if (!parsedSlug.success) {
    return failure("Utilise 3 à 40 lettres minuscules, chiffres ou tirets.");
  }

  try {
    const user = await getVerifiedOwner();

    if (!user || !(await userOwnsShop(shopId, user.id))) {
      return failure("Tu n’as pas accès à cette boutique.");
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("shops")
      .select("id")
      .eq("slug", slug)
      .neq("id", shopId)
      .maybeSingle();

    if (error) {
      await logError("shop_onboarding_slug_check_failed", error);
      return failure("L’adresse n’a pas pu être vérifiée. Réessaie.");
    }

    return {
      success: !data,
      message: data
        ? "Cette adresse est déjà utilisée."
        : "Cette adresse est disponible.",
    };
  } catch (error) {
    await logError("shop_onboarding_slug_check_failed", error);
    return failure("L’adresse n’a pas pu être vérifiée. Réessaie.");
  }
}

export async function saveOnboardingDraft(
  shopId: string,
  input: unknown,
): Promise<OnboardingActionResult> {
  const parsed = saveOnboardingSchema.safeParse(input);

  if (!parsed.success) {
    return failure(
      "Vérifie le nom, l’adresse, les coordonnées et les horaires de ta boutique.",
    );
  }

  try {
    const user = await getVerifiedOwner();

    if (!user || !(await userOwnsShop(shopId, user.id))) {
      return failure("Tu n’as pas accès à cette boutique.");
    }

    const supabase = await createClient();
    const draft = parsed.data.draft;
    const hasValidIdentity =
      draft.name.trim().length >= 2 &&
      validShopSlugSchema.safeParse(draft.slug).success;

    if (
      draft.logoPath &&
      (!draft.logoPath.startsWith(`${shopId}/`) ||
        !/^.+\/logo-[0-9a-f-]+\.(jpg|png|webp)$/i.test(draft.logoPath))
    ) {
      return failure(
        "Le chemin du logo est invalide. Envoie à nouveau l’image.",
      );
    }

    const shopUpdates: Database["public"]["Tables"]["shops"]["Update"] = {
      category: draft.category,
      logo_path: draft.logoPath,
      district: draft.district || null,
      address: draft.address || null,
    };

    if (hasValidIdentity) {
      const { data: conflictingShop, error: slugError } = await supabase
        .from("shops")
        .select("id")
        .eq("slug", draft.slug)
        .neq("id", shopId)
        .maybeSingle();

      if (slugError) {
        await logError("shop_onboarding_save_failed", slugError);
        return failure("Le brouillon n’a pas pu être enregistré. Réessaie.");
      }

      if (conflictingShop) {
        return failure(
          "Cette adresse est déjà utilisée par une autre boutique.",
        );
      }

      shopUpdates.name = draft.name;
      shopUpdates.slug = draft.slug;
    }

    if (validBrandColorSchema.safeParse(draft.brandColor).success) {
      shopUpdates.brand_color = draft.brandColor;
    }

    if (
      draft.whatsapp === "" ||
      validPhoneSchema.safeParse(draft.whatsapp).success
    ) {
      shopUpdates.whatsapp = draft.whatsapp || null;
    }

    if (draft.phone === "" || validPhoneSchema.safeParse(draft.phone).success) {
      shopUpdates.phone = draft.phone || null;
    }

    if (draft.city.length >= 2) {
      shopUpdates.city = draft.city;
    }

    if (hasCompleteOpeningHours(draft.openingHours)) {
      shopUpdates.opening_hours = draft.openingHours satisfies Json;
    }

    if (
      (draft.lat === null && draft.lng === null) ||
      (draft.lat !== null && draft.lng !== null)
    ) {
      shopUpdates.lat = draft.lat;
      shopUpdates.lng = draft.lng;
    }

    const { error: shopError } = await supabase
      .from("shops")
      .update(shopUpdates)
      .eq("id", shopId);

    if (shopError) {
      await logError("shop_onboarding_save_failed", shopError);
      if (shopError.code === "23505") {
        return failure(
          "Cette adresse est déjà utilisée par une autre boutique.",
        );
      }
      return failure("Le brouillon n’a pas pu être enregistré. Réessaie.");
    }

    const { error: onboardingError } = await supabase
      .from("shop_onboarding")
      .update({
        current_step: parsed.data.currentStep,
        draft: draft satisfies Json,
      })
      .eq("shop_id", shopId);

    if (onboardingError) {
      await logError("shop_onboarding_save_failed", onboardingError);
      return failure("Le brouillon n’a pas pu être enregistré. Réessaie.");
    }

    expirePublicShopIndex();
    return { success: true, message: "Enregistré." };
  } catch (error) {
    await logError("shop_onboarding_save_failed", error);
    return failure("Le brouillon n’a pas pu être enregistré. Réessaie.");
  }
}

export async function saveOnboardingPaymentMethods(
  shopId: string,
  input: unknown,
): Promise<OnboardingActionResult> {
  const parsedShopId = z.string().uuid().safeParse(shopId);
  const methods = onboardingPaymentMethodsSchema.safeParse(input);
  if (!parsedShopId.success || !methods.success) {
    return failure(
      "Ajoute au moins un mode de paiement et vérifie les numéros et codes USSD.",
    );
  }

  try {
    const user = await getVerifiedOwner();
    if (!user || !(await userOwnsShop(parsedShopId.data, user.id))) {
      return failure("Tu n’as pas accès à cette boutique.");
    }

    const normalizedMethods = methods.data.map((method) =>
      method.type === "ussd_orange" || method.type === "ussd_moov"
        ? {
            type: method.type,
            phone: method.phone.startsWith("+226")
              ? method.phone
              : `+226${method.phone}`,
            ussdTemplate: method.ussdTemplate,
          }
        : method,
    );
    const supabase = await createClient();
    const { error } = await supabase.rpc("save_onboarding_payment_methods", {
      p_shop: parsedShopId.data,
      p_methods: normalizedMethods satisfies Json,
    });

    if (error) {
      await logError("shop_onboarding_payment_methods_save_failed", error);
      return failure(
        error.message.includes("invalid_payment_methods")
          ? "Vérifie les numéros et codes USSD saisis."
          : "Les modes d’encaissement n’ont pas pu être enregistrés.",
      );
    }

    revalidatePath("/dashboard/onboarding");
    revalidatePath("/dashboard/onboarding/preview");
    return { success: true, message: "Modes d’encaissement enregistrés." };
  } catch (error) {
    await logError("shop_onboarding_payment_methods_save_failed", error);
    return failure("Les modes d’encaissement n’ont pas pu être enregistrés.");
  }
}

export async function submitShopForReview(
  shopId: unknown,
): Promise<OnboardingActionResult> {
  const parsedShopId = z.string().uuid().safeParse(shopId);
  if (!parsedShopId.success) {
    return failure("Cette boutique ne peut pas être soumise.");
  }

  try {
    const user = await getVerifiedOwner();
    if (!user || !(await userOwnsShop(parsedShopId.data, user.id))) {
      return failure("Tu n’as pas accès à cette boutique.");
    }

    const supabase = await createClient();
    const { error } = await supabase.rpc("submit_shop_for_review", {
      p_shop: parsedShopId.data,
    });
    if (error) {
      await logError("shop_onboarding_submit_failed", error);
      const errors: Record<string, string> = {
        missing_whatsapp: "Ajoute un numéro WhatsApp valide à ta boutique.",
        missing_catalog: "Ajoute au moins un vrai produit ou service.",
        missing_payment_method: "Configure au moins un mode d’encaissement.",
        invalid_review_state: "Cette boutique a déjà été soumise.",
      };
      const match = Object.entries(errors).find(([key]) =>
        error.message.includes(key),
      );
      return failure(
        match?.[1] ?? "La boutique n’a pas pu être soumise. Réessaie.",
      );
    }

    revalidatePath("/dashboard/onboarding");
    revalidatePath("/dashboard");
    return {
      success: true,
      message: "Ta boutique a été envoyée pour validation.",
      shopId: parsedShopId.data,
    };
  } catch (error) {
    await logError("shop_onboarding_submit_failed", error);
    return failure("La boutique n’a pas pu être soumise. Réessaie.");
  }
}

export async function uploadShopLogo(
  shopId: string,
  file: File,
): Promise<OnboardingActionResult> {
  if (
    !(file instanceof File) ||
    file.size === 0 ||
    file.size > 5 * 1024 * 1024 ||
    !["image/jpeg", "image/png", "image/webp"].includes(file.type)
  ) {
    return failure("Choisis une image JPG, PNG ou WebP de 5 Mo maximum.");
  }

  try {
    const user = await getVerifiedOwner();

    if (!user || !(await userOwnsShop(shopId, user.id))) {
      return failure("Tu n’as pas accès à cette boutique.");
    }

    const supabase = await createClient();
    const extension = file.type === "image/jpeg" ? "jpg" : file.type.slice(6);
    const path = `${shopId}/logo-${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from("shop-assets")
      .upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      await logError("shop_onboarding_logo_upload_failed", uploadError);
      return failure("Le logo n’a pas pu être envoyé. Réessaie.");
    }

    const { error: updateError } = await supabase
      .from("shops")
      .update({ logo_path: path })
      .eq("id", shopId);

    if (updateError) {
      const { error: cleanupError } = await supabase.storage
        .from("shop-assets")
        .remove([path]);

      if (cleanupError) {
        await logError("shop_onboarding_logo_cleanup_failed", cleanupError);
      }
      await logError("shop_onboarding_logo_upload_failed", updateError);
      return failure("Le logo n’a pas pu être enregistré. Réessaie.");
    }

    const { data } = supabase.storage.from("shop-assets").getPublicUrl(path);
    return {
      success: true,
      message: "Logo enregistré.",
      path,
      publicUrl: data.publicUrl,
    };
  } catch (error) {
    await logError("shop_onboarding_logo_upload_failed", error);
    return failure("Le logo n’a pas pu être envoyé. Réessaie.");
  }
}

export async function removeShopLogo(
  shopId: string,
  logoPath: string,
): Promise<OnboardingActionResult> {
  if (!logoPath.startsWith(`${shopId}/`)) {
    return failure("Le chemin du logo est invalide.");
  }

  try {
    const user = await getVerifiedOwner();

    if (!user || !(await userOwnsShop(shopId, user.id))) {
      return failure("Tu n’as pas accès à cette boutique.");
    }

    const supabase = await createClient();
    const { data: shop, error: readError } = await supabase
      .from("shops")
      .select("logo_path")
      .eq("id", shopId)
      .maybeSingle();

    if (readError || !shop) {
      if (readError) {
        await logError("shop_onboarding_logo_cleanup_failed", readError);
      }
      return failure("Le logo n’a pas pu être retiré. Réessaie.");
    }

    if (shop.logo_path !== logoPath) {
      return failure("Le logo a changé. Actualise la page avant de réessayer.");
    }

    const { error: updateError } = await supabase
      .from("shops")
      .update({ logo_path: null })
      .eq("id", shopId);

    if (updateError) {
      await logError("shop_onboarding_logo_cleanup_failed", updateError);
      return failure("Le logo n’a pas pu être retiré. Réessaie.");
    }

    const { error: removeError } = await supabase.storage
      .from("shop-assets")
      .remove([logoPath]);

    if (removeError) {
      await logError("shop_onboarding_logo_cleanup_failed", removeError);
      return {
        success: true,
        message: "Logo retiré, mais le fichier n’a pas pu être supprimé.",
      };
    }

    return { success: true, message: "Logo retiré." };
  } catch (error) {
    await logError("shop_onboarding_logo_cleanup_failed", error);
    return failure("Le logo n’a pas pu être retiré. Réessaie.");
  }
}
