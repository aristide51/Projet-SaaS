import "server-only";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { logError } from "@/lib/monitoring/sentry";
import { validateServerEnv } from "@/lib/env";

export const GUEST_CART_COOKIE = "guest-cart";
const GUEST_CART_MAX_AGE = 60 * 60 * 24 * 30;
const GUEST_CART_TOKEN_PATTERN = /^[0-9a-f]{64}$/;

export type CartLine = {
  cart_id: string;
  item_id: string;
  product_id: string;
  variant_id: string | null;
  product_name: string;
  variant_name: string | null;
  quantity: number;
  unit_price: number;
  status: string;
  can_order: boolean;
  stock_limited: boolean;
};

export type CartSnapshot = {
  items: CartLine[];
  quantity: number;
  hasGuestCart: boolean;
};

export async function getCartSnapshot(shopId: string): Promise<CartSnapshot> {
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get(GUEST_CART_COOKIE)?.value;
  const guestToken =
    cookieToken && GUEST_CART_TOKEN_PATTERN.test(cookieToken)
      ? cookieToken
      : null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_cart_snapshot", {
    p_shop: shopId,
    ...(guestToken ? { p_guest_token: guestToken } : {}),
  });

  if (error) {
    await logError("cart_snapshot_failed", error);
    throw new Error("Impossible de charger le panier de cette boutique.", {
      cause: error,
    });
  }

  const items: CartLine[] = (data ?? []).map((item) => ({
    ...item,
    variant_id: item.variant_id ?? null,
    variant_name: item.variant_name ?? null,
  }));
  return {
    items,
    quantity: items.reduce((total, item) => total + item.quantity, 0),
    hasGuestCart: guestToken !== null,
  };
}

export async function hasGuestCartCookie() {
  const cookieStore = await cookies();
  const token = cookieStore.get(GUEST_CART_COOKIE)?.value;
  return Boolean(token && GUEST_CART_TOKEN_PATTERN.test(token));
}

export async function ensureGuestCartToken() {
  const cookieStore = await cookies();
  const existing = cookieStore.get(GUEST_CART_COOKIE)?.value;
  if (existing && GUEST_CART_TOKEN_PATTERN.test(existing)) return existing;

  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  const { NEXT_PUBLIC_SUPABASE_URL } = validateServerEnv();
  cookieStore.set(GUEST_CART_COOKIE, token, {
    httpOnly: true,
    secure: NEXT_PUBLIC_SUPABASE_URL.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    maxAge: GUEST_CART_MAX_AGE,
  });
  return token;
}

export async function mergeGuestCartCookieIntoAccount() {
  const cookieStore = await cookies();
  const token = cookieStore.get(GUEST_CART_COOKIE)?.value;
  if (!token) return true;
  if (!GUEST_CART_TOKEN_PATTERN.test(token)) {
    cookieStore.delete(GUEST_CART_COOKIE);
    return true;
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.rpc("merge_guest_carts", {
      p_guest_token: token,
    });
    if (error) {
      await logError("cart_guest_merge_failed", error);
      return false;
    }

    cookieStore.delete(GUEST_CART_COOKIE);
    return true;
  } catch (error) {
    await logError("cart_guest_merge_failed", error);
    return false;
  }
}
