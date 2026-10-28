"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { logError } from "@/lib/monitoring/sentry";
import { createClient, getOptionalUser } from "@/lib/supabase/server";

const uuid = z.string().uuid();
const couponSchema = z.object({
  shopId: uuid,
  couponId: uuid.nullable(),
  code: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_-]{3,24}$/),
  type: z.enum(["percent", "fixed"]),
  value: z.number().int().positive(),
  minAmount: z.number().int().nonnegative(),
  startsAt: z.string().datetime().nullable(),
  endsAt: z.string().datetime().nullable(),
  maxUses: z.number().int().positive().nullable(),
  perCustomerLimit: z.number().int().positive(),
  productIds: z.array(uuid).max(100),
  categoryIds: z.array(uuid).max(100),
  active: z.boolean(),
});

export type CouponActionResult =
  { success: true; message: string } | { success: false; message: string };

export async function saveCoupon(input: unknown): Promise<CouponActionResult> {
  const parsed = couponSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      message: "Vérifie le code, la remise et les limites saisies.",
    };
  }
  if (parsed.data.type === "percent" && parsed.data.value > 100) {
    return {
      success: false,
      message: "Une remise en pourcentage ne dépasse pas 100 %.",
    };
  }
  if (
    parsed.data.startsAt &&
    parsed.data.endsAt &&
    parsed.data.endsAt <= parsed.data.startsAt
  ) {
    return {
      success: false,
      message: "La date de fin doit suivre la date de début.",
    };
  }

  const user = await getOptionalUser();
  if (!user?.email_confirmed_at) {
    return {
      success: false,
      message: "Connecte-toi avec une adresse confirmée.",
    };
  }
  const supabase = await createClient();
  const { data: membership, error: membershipError } = await supabase
    .from("shop_members")
    .select("role, permissions")
    .eq("shop_id", parsed.data.shopId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (membershipError) {
    await logError("coupon_access_check_failed", membershipError);
    return { success: false, message: "Impossible de vérifier tes droits." };
  }
  const permissions =
    typeof membership?.permissions === "object" &&
    membership.permissions !== null &&
    !Array.isArray(membership.permissions)
      ? membership.permissions
      : {};
  if (
    !membership ||
    (membership.role !== "owner" && permissions.promotions !== true)
  ) {
    return {
      success: false,
      message: "Tu n’as pas le droit de gérer les promotions.",
    };
  }

  const { error } = await supabase.rpc("save_coupon", {
    p_shop_id: parsed.data.shopId,
    p_code: parsed.data.code,
    p_type: parsed.data.type,
    p_value: parsed.data.value,
    p_min_amount: parsed.data.minAmount,
    p_per_customer_limit: parsed.data.perCustomerLimit,
    p_scope: {
      product_ids: parsed.data.productIds,
      category_ids: parsed.data.categoryIds,
    },
    p_active: parsed.data.active,
    ...(parsed.data.couponId ? { p_coupon_id: parsed.data.couponId } : {}),
    ...(parsed.data.startsAt ? { p_starts_at: parsed.data.startsAt } : {}),
    ...(parsed.data.endsAt ? { p_ends_at: parsed.data.endsAt } : {}),
    ...(parsed.data.maxUses ? { p_max_uses: parsed.data.maxUses } : {}),
  });
  if (error) {
    if (error.message.includes("plan_feature_promotions")) {
      return {
        success: false,
        message: "Les promotions sont réservées au plan Pro.",
      };
    }
    if (error.message.includes("coupon_scope")) {
      return {
        success: false,
        message:
          "Un produit ou une catégorie sélectionnée n’est plus disponible.",
      };
    }
    if (error.code === "23505") {
      return {
        success: false,
        message: "Ce code existe déjà dans cette boutique.",
      };
    }
    await logError("coupon_save_failed", error);
    return {
      success: false,
      message: "La promotion n’a pas pu être enregistrée.",
    };
  }
  revalidatePath("/dashboard/promotions");
  return { success: true, message: "Promotion enregistrée." };
}
