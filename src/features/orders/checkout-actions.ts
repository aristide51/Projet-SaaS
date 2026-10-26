"use server";

import { z } from "zod";
import { logError } from "@/lib/monitoring/sentry";
import { createClient, getOptionalUser } from "@/lib/supabase/server";
import { checkoutInputSchema } from "./checkout-schemas";

const uuidSchema = z.string().uuid();

type CheckoutValues = ReturnType<typeof checkoutInputSchema.parse>;

export type CheckoutPreviewResult =
  | {
      success: true;
      subtotal: number;
      discount: number;
      total: number;
    }
  | {
      success: false;
      message: string;
      suggestion?: string;
    };

export type PlaceOrderResult =
  | { success: true; orderId: string }
  | { success: false; message: string; suggestion?: string };

function checkoutError(message: string) {
  if (message.includes("insufficient_stock")) {
    return {
      message: "Le stock disponible a changé depuis l’ajout au panier.",
      suggestion:
        "Réduis la quantité ou retire l’article, puis recalcule le total.",
    };
  }
  if (
    message.includes("product_unavailable") ||
    message.includes("variant_unavailable")
  ) {
    return {
      message: "Un article de ton panier n’est plus disponible.",
      suggestion: "Retire l’article indisponible puis recalcule le total.",
    };
  }
  if (message.includes("amount_exceeds_manual_limit")) {
    return {
      message: "Le montant dépasse le plafond du paiement mobile proposé.",
      suggestion:
        "Réduis le panier ou choisis un autre mode de paiement disponible.",
    };
  }
  if (message.includes("coupon_invalid")) {
    return {
      message: "Ce code promo est invalide ou n’est plus actif.",
      suggestion: "Vérifie le code ou efface-le pour continuer sans réduction.",
    };
  }
  if (message.includes("coupon_min_amount")) {
    return {
      message:
        "Le montant du panier n’atteint pas le minimum requis pour ce code.",
      suggestion: "Ajoute des articles ou efface le code promo.",
    };
  }
  if (message.includes("coupon_exhausted")) {
    return {
      message: "Ce code promo a atteint sa limite d’utilisation.",
      suggestion: "Efface le code pour continuer sans réduction.",
    };
  }
  if (message.includes("coupon_already_used")) {
    return {
      message: "Tu as déjà utilisé ce code promo.",
      suggestion: "Efface le code pour continuer sans réduction.",
    };
  }
  if (message.includes("delivery_disabled")) {
    return {
      message: "La livraison n’est pas proposée par cette boutique.",
      suggestion: "Choisis le retrait en boutique.",
    };
  }
  if (message.includes("pickup_disabled")) {
    return {
      message: "Le retrait en boutique n’est pas proposé actuellement.",
      suggestion: "Choisis la livraison si elle est disponible.",
    };
  }
  if (message.includes("delivery_address_required")) {
    return {
      message: "Indique une adresse de livraison.",
      suggestion:
        "Ajoute ton quartier et les précisions utiles pour te trouver.",
    };
  }
  if (message.includes("payment_method_not_available")) {
    return {
      message: "Ce mode de paiement n’est plus disponible.",
      suggestion: "Choisis un autre mode de paiement proposé.",
    };
  }
  if (message.includes("phone_required")) {
    return {
      message: "Un numéro de téléphone est nécessaire pour commander.",
      suggestion:
        "Complète ton numéro dans ton profil, puis reviens au panier.",
    };
  }
  if (message.includes("cart_empty") || message.includes("cart_not_found")) {
    return {
      message: "Ton panier est vide ou a changé.",
      suggestion: "Retourne à la boutique pour vérifier les articles.",
    };
  }
  if (message.includes("shop_not_available")) {
    return {
      message: "Cette boutique n’est plus disponible.",
      suggestion: "Retourne à l’accueil de la boutique ou réessaie plus tard.",
    };
  }
  return {
    message: "La commande n’a pas pu être validée.",
    suggestion: "Vérifie les informations du formulaire et réessaie.",
  };
}

async function verifyCheckoutUser() {
  const user = await getOptionalUser();
  if (!user?.email_confirmed_at) {
    return null;
  }
  return user;
}

async function verifyCartForShop(
  cartId: string,
  shopId: string,
  event: "checkout_preview_failed" | "checkout_order_failed",
) {
  const supabase = await createClient();
  const user = await verifyCheckoutUser();
  if (!user) {
    return {
      error: {
        message:
          "Connecte-toi avec une adresse e-mail confirmée pour commander.",
        suggestion: "Connecte-toi puis réessaie depuis ton panier.",
      },
    } as const;
  }

  const { data, error } = await supabase
    .from("carts")
    .select("id, shop_id")
    .eq("id", cartId)
    .eq("customer_id", user.id)
    .maybeSingle();

  if (error) {
    await logError(event, error);
    return {
      error: {
        message: "Impossible de vérifier ton panier.",
        suggestion: "Recharge la page puis réessaie.",
      },
    } as const;
  }
  if (!data || data.shop_id !== shopId) {
    return { error: checkoutError("cart_not_found") } as const;
  }
  return { supabase, user } as const;
}

function parseCheckoutInput(input: unknown) {
  const result = checkoutInputSchema.safeParse(input);
  return result.success ? result.data : null;
}

export async function previewCheckout(
  shopId: string,
  input: unknown,
): Promise<CheckoutPreviewResult> {
  const values = parseCheckoutInput(input);
  if (!uuidSchema.safeParse(shopId).success || !values) {
    return { success: false, message: "Vérifie les informations de commande." };
  }

  try {
    const access = await verifyCartForShop(
      values.cartId,
      shopId,
      "checkout_preview_failed",
    );
    if ("error" in access) {
      return { success: false, ...access.error };
    }

    const { data, error } = await access.supabase.rpc("preview_order", {
      p_cart_id: values.cartId,
      p_payment_method: values.paymentMethod,
      p_fulfillment: values.fulfillment,
      p_coupon_code: values.couponCode?.trim() ?? "",
    });
    if (error) {
      const mapped = checkoutError(error.message);
      if (mapped.message === "La commande n’a pas pu être validée.") {
        await logError("checkout_preview_failed", error);
      }
      return { success: false, ...mapped };
    }

    const preview = data?.[0];
    if (!preview) {
      await logError(
        "checkout_preview_failed",
        new Error("Aucun résultat retourné par preview_order."),
      );
      return {
        success: false,
        message: "Le total n’a pas pu être calculé.",
        suggestion: "Recharge le panier puis réessaie.",
      };
    }
    if (preview.errors.length) {
      const mapped = checkoutError(preview.errors[0] ?? "");
      return { success: false, ...mapped };
    }
    if (
      preview.subtotal === null ||
      preview.discount === null ||
      preview.total === null
    ) {
      await logError(
        "checkout_preview_failed",
        new Error("L’aperçu a retourné des montants incomplets."),
      );
      return {
        success: false,
        message: "Le total n’a pas pu être calculé.",
        suggestion: "Recharge le panier puis réessaie.",
      };
    }
    return {
      success: true,
      subtotal: preview.subtotal,
      discount: preview.discount,
      total: preview.total,
    };
  } catch (error) {
    await logError("checkout_preview_failed", error);
    return {
      success: false,
      message: "Le total n’a pas pu être calculé.",
      suggestion: "Vérifie ta connexion et réessaie.",
    };
  }
}

export async function placeOrder(
  shopId: string,
  input: unknown,
): Promise<PlaceOrderResult> {
  const values = parseCheckoutInput(input);
  if (!uuidSchema.safeParse(shopId).success || !values) {
    return { success: false, message: "Vérifie les informations de commande." };
  }
  if (values.fulfillment === "delivery" && !values.deliveryAddress?.trim()) {
    return { success: false, ...checkoutError("delivery_address_required") };
  }

  try {
    const access = await verifyCartForShop(
      values.cartId,
      shopId,
      "checkout_order_failed",
    );
    if ("error" in access) {
      return { success: false, ...access.error };
    }

    const { data: orderId, error } = await access.supabase.rpc(
      "create_order_from_cart",
      {
        p_cart_id: values.cartId,
        p_payment_method: values.paymentMethod,
        p_fulfillment: values.fulfillment,
        ...(values.fulfillment === "delivery" && values.deliveryAddress
          ? { p_delivery_address: values.deliveryAddress.trim() }
          : {}),
        ...(values.note?.trim() ? { p_note: values.note.trim() } : {}),
        ...(values.couponCode?.trim()
          ? { p_coupon_code: values.couponCode.trim() }
          : {}),
      },
    );
    if (error) {
      const mapped = checkoutError(error.message);
      if (mapped.message === "La commande n’a pas pu être validée.") {
        await logError("checkout_order_failed", error);
      }
      return { success: false, ...mapped };
    }
    if (!orderId) {
      await logError(
        "checkout_order_failed",
        new Error("create_order_from_cart n’a pas retourné d’identifiant."),
      );
      return {
        success: false,
        message: "La commande n’a pas pu être confirmée.",
        suggestion: "Vérifie ton espace commandes avant de réessayer.",
      };
    }

    return { success: true, orderId };
  } catch (error) {
    await logError("checkout_order_failed", error);
    return {
      success: false,
      message: "La commande n’a pas pu être enregistrée.",
      suggestion: "Vérifie ton espace commandes avant de réessayer.",
    };
  }
}

export type CheckoutFormValues = CheckoutValues;
