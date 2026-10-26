import { revalidateTag, updateTag } from "next/cache";

export const PUBLIC_SHOPS_CACHE_TAG = "storefront:shops";

export function publicShopCacheTag(shopId: string) {
  return `storefront:shop:${shopId}`;
}

export function revalidatePublicShop(shopId: string) {
  revalidateTag(publicShopCacheTag(shopId), "max");
}

export function expirePublicShopIndex() {
  updateTag(PUBLIC_SHOPS_CACHE_TAG);
}
