"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  expirePublicShopIndex,
  revalidatePublicShop,
} from "@/features/storefront/cache";
import { requireAdminUser } from "@/lib/auth/guards";
import { logError } from "@/lib/monitoring/sentry";
import { createClient } from "@/lib/supabase/server";

const shopIdSchema = z.string().uuid();
const reasonSchema = z.string().trim().max(500);
const checklistSchema = z.object({
  identity: z.literal(true),
  logo: z.literal(true),
  photos: z.literal(true),
  contact: z.literal(true),
  catalog: z.literal(true),
  terms: z.literal(true),
});

export type AdminActionResult = {
  success: boolean;
  message: string;
  refresh?: boolean;
};

export async function decideShopReview(
  input: unknown,
): Promise<AdminActionResult> {
  const parsed = z
    .object({
      shopId: shopIdSchema,
      approve: z.boolean(),
      reason: reasonSchema,
      checklist: checklistSchema.optional(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Vérifie les informations de décision." };
  }
  if (!parsed.data.approve && parsed.data.reason.length < 3) {
    return { success: false, message: "Le motif de refus est obligatoire." };
  }
  if (parsed.data.approve && !parsed.data.checklist) {
    return {
      success: false,
      message: "Confirme chaque point de contrôle avant l’approbation.",
    };
  }

  await requireAdminUser();
  const supabase = await createClient();
  try {
    const { error } = await supabase.rpc("review_shop", {
      p_shop: parsed.data.shopId,
      p_approve: parsed.data.approve,
      ...(parsed.data.approve ? {} : { p_reason: parsed.data.reason }),
    });
    if (error) {
      await logError("admin_shop_review_failed", error);
      return {
        success: false,
        message:
          error.message === "invalid_review_state"
            ? "Cette boutique n’est plus en attente de validation."
            : "La décision n’a pas pu être enregistrée.",
      };
    }

    expirePublicShopIndex();
    revalidatePublicShop(parsed.data.shopId);
    revalidatePath("/admin");
    revalidatePath("/dashboard/onboarding");
    revalidatePath("/", "layout");
  } catch (error) {
    await logError("admin_shop_review_failed", error);
    return {
      success: false,
      message: "La décision n’a pas pu être enregistrée.",
    };
  }

  try {
    const { error } = await supabase.functions.invoke(
      "send-shop-review-decision",
      {
        body: {
          shopId: parsed.data.shopId,
          approved: parsed.data.approve,
          reason: parsed.data.approve ? null : parsed.data.reason,
        },
      },
    );
    if (error) {
      await logError("admin_shop_review_email_failed", error);
      return {
        success: true,
        message:
          "Décision enregistrée et notification dans le tableau de bord. L’e-mail n’a pas pu être envoyé.",
        refresh: false,
      };
    }

    return {
      success: true,
      message: parsed.data.approve
        ? "Boutique approuvée. E-mail de décision envoyé."
        : "Boutique refusée. Motif et e-mail envoyés.",
    };
  } catch (error) {
    await logError("admin_shop_review_email_failed", error);
    return {
      success: true,
      message:
        "Décision enregistrée et notification dans le tableau de bord. L’e-mail n’a pas pu être envoyé.",
      refresh: false,
    };
  }
}

export async function setShopSuspension(
  shopId: string,
  suspended: boolean,
  reason: string,
): Promise<AdminActionResult> {
  if (
    !shopIdSchema.safeParse(shopId).success ||
    typeof suspended !== "boolean" ||
    !reasonSchema.safeParse(reason).success ||
    reason.trim().length < 3
  ) {
    return {
      success: false,
      message: "Un motif de 3 caractères minimum est requis.",
    };
  }

  await requireAdminUser();
  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_shop_suspended", {
      p_shop: shopId,
      p_suspended: suspended,
      p_reason: reason.trim(),
    });
    if (error) {
      await logError("admin_shop_suspension_failed", error);
      return {
        success: false,
        message: "Le changement de statut n’a pas pu être enregistré.",
      };
    }

    expirePublicShopIndex();
    revalidatePublicShop(shopId);
    revalidatePath("/admin");
    revalidatePath("/", "layout");
    return {
      success: true,
      message: suspended
        ? "Boutique suspendue et journalisée."
        : "Boutique réactivée et journalisée.",
    };
  } catch (error) {
    await logError("admin_shop_suspension_failed", error);
    return {
      success: false,
      message: "Le changement de statut n’a pas pu être enregistré.",
    };
  }
}
