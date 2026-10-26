"use server";

import { z } from "zod";
import { createClient, getOptionalUser } from "@/lib/supabase/server";
import { logError } from "@/lib/monitoring/sentry";
import {
  ensureGuestCartToken,
  getCartSnapshot,
  mergeGuestCartCookieIntoAccount,
} from "./data";
import type { CartSnapshot } from "./data";

const uuidSchema = z.string().uuid();
const quantitySchema = z.number().int().min(1).max(99);

export type CartActionResult =
  | { success: true; message: string; cart: CartSnapshot }
  | { success: false; message: string };

function failure(message: string): CartActionResult {
  return { success: false, message };
}

function databaseMessage(message: string) {
  if (message.includes("insufficient_stock")) {
    return "La quantité demandée dépasse le stock disponible.";
  }
  if (message.includes("product_unavailable")) {
    return "Cet article n’est plus disponible.";
  }
  if (message.includes("variant_unavailable")) {
    return "Cette variante n’est plus disponible.";
  }
  if (message.includes("shop_not_available")) {
    return "Cette boutique n’est plus disponible.";
  }
  if (message.includes("cart_quantity_limit")) {
    return "La quantité maximale par article est de 99.";
  }
  if (message.includes("invalid_cart_quantity")) {
    return "La quantité doit être comprise entre 1 et 99.";
  }
  if (message.includes("cart_item_not_found")) {
    return "Cet article n’est plus dans le panier.";
  }
  if (message.includes("invalid_guest_cart_token")) {
    return "Le panier invité a expiré. Ajoute à nouveau cet article.";
  }
  return "La modification du panier a échoué. Réessaie.";
}

async function guestToken() {
  try {
    const user = await getOptionalUser();
    return user ? null : ensureGuestCartToken();
  } catch (error) {
    await logError("cart_auth_check_failed", error);
    throw new Error("La session n’a pas pu être vérifiée.", { cause: error });
  }
}

async function finishMutation(
  shopId: string,
  result: { error: { message: string } | null },
  successMessage: string,
  event: "cart_add_failed" | "cart_update_failed" | "cart_remove_failed",
): Promise<CartActionResult> {
  if (result.error) {
    if (
      result.error.message.includes("insufficient_stock") ||
      result.error.message.includes("product_unavailable") ||
      result.error.message.includes("variant_unavailable") ||
      result.error.message.includes("shop_not_available") ||
      result.error.message.includes("cart_quantity_limit") ||
      result.error.message.includes("invalid_cart_quantity") ||
      result.error.message.includes("cart_item_not_found") ||
      result.error.message.includes("invalid_guest_cart_token")
    ) {
      return failure(databaseMessage(result.error.message));
    }
    await logError(event, result.error);
    return failure("La modification du panier a échoué. Réessaie.");
  }

  try {
    return {
      success: true,
      message: successMessage,
      cart: await getCartSnapshot(shopId),
    };
  } catch (error) {
    await logError(event, error);
    return failure(
      "Le panier a été modifié, mais son actualisation a échoué. Recharge la page.",
    );
  }
}

export async function addCartItem(
  shopId: string,
  productId: string,
  variantId: string | null,
  quantity = 1,
): Promise<CartActionResult> {
  if (
    !uuidSchema.safeParse(shopId).success ||
    !uuidSchema.safeParse(productId).success ||
    (variantId !== null && !uuidSchema.safeParse(variantId).success) ||
    !quantitySchema.safeParse(quantity).success
  ) {
    return failure("Vérifie l’article et la quantité demandés.");
  }

  try {
    const token = await guestToken();
    const supabase = await createClient();
    const { error } = await supabase.rpc("add_cart_item", {
      p_shop: shopId,
      p_product: productId,
      p_quantity: quantity,
      ...(variantId ? { p_variant: variantId } : {}),
      ...(token ? { p_guest_token: token } : {}),
    });
    return finishMutation(
      shopId,
      { error },
      "Article ajouté au panier.",
      "cart_add_failed",
    );
  } catch (error) {
    await logError("cart_add_failed", error);
    return failure("L’article n’a pas pu être ajouté au panier. Réessaie.");
  }
}

export async function setCartItemQuantity(
  shopId: string,
  itemId: string,
  quantity: number,
): Promise<CartActionResult> {
  if (
    !uuidSchema.safeParse(shopId).success ||
    !uuidSchema.safeParse(itemId).success ||
    !quantitySchema.safeParse(quantity).success
  ) {
    return failure("La quantité doit être comprise entre 1 et 99.");
  }

  try {
    const token = await guestToken();
    const supabase = await createClient();
    const { error } = await supabase.rpc("set_cart_item_quantity", {
      p_shop: shopId,
      p_item: itemId,
      p_quantity: quantity,
      ...(token ? { p_guest_token: token } : {}),
    });
    return finishMutation(
      shopId,
      { error },
      "Quantité mise à jour.",
      "cart_update_failed",
    );
  } catch (error) {
    await logError("cart_update_failed", error);
    return failure("La quantité n’a pas pu être modifiée. Réessaie.");
  }
}

export async function removeCartItem(
  shopId: string,
  itemId: string,
): Promise<CartActionResult> {
  if (
    !uuidSchema.safeParse(shopId).success ||
    !uuidSchema.safeParse(itemId).success
  ) {
    return failure("Cet article n’est pas valide.");
  }

  try {
    const token = await guestToken();
    const supabase = await createClient();
    const { error } = await supabase.rpc("remove_cart_item", {
      p_shop: shopId,
      p_item: itemId,
      ...(token ? { p_guest_token: token } : {}),
    });
    return finishMutation(
      shopId,
      { error },
      "Article retiré du panier.",
      "cart_remove_failed",
    );
  } catch (error) {
    await logError("cart_remove_failed", error);
    return failure("L’article n’a pas pu être retiré. Réessaie.");
  }
}

export async function loadCartForShop(
  shopId: string,
): Promise<CartActionResult> {
  if (!uuidSchema.safeParse(shopId).success) {
    return failure("Cette boutique n’est pas valide.");
  }

  try {
    return {
      success: true,
      message: "Panier chargé.",
      cart: await getCartSnapshot(shopId),
    };
  } catch (error) {
    await logError("cart_snapshot_failed", error);
    return failure("Le panier n’a pas pu être chargé. Réessaie.");
  }
}

export async function mergeGuestCartForShop(
  shopId: string,
): Promise<CartActionResult> {
  if (!uuidSchema.safeParse(shopId).success) {
    return failure("Cette boutique n’est pas valide.");
  }

  const merged = await mergeGuestCartCookieIntoAccount();
  if (!merged) {
    return failure(
      "Ton panier invité est conservé, mais n’a pas encore pu être fusionné.",
    );
  }

  try {
    return {
      success: true,
      message: "Panier synchronisé.",
      cart: await getCartSnapshot(shopId),
    };
  } catch (error) {
    await logError("cart_snapshot_failed", error);
    return failure("Le panier synchronisé n’a pas pu être rechargé.");
  }
}
