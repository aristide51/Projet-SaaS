const RESERVED_SHOP_SLUGS = new Set([
  "account",
  "admin",
  "api",
  "app",
  "auth",
  "booking-cancel",
  "dashboard",
  "design",
  "manifest",
  "p",
  "robots",
  "shops",
  "sitemap",
]);

const SHOP_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const PRODUCT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isPublicPwaPath(pathname: string) {
  if (pathname === "/" || pathname === "/shops") return true;

  const productMatch = pathname.match(
    /^\/([a-z0-9][a-z0-9-]{1,38}[a-z0-9])\/products\/([^/]+)$/,
  );
  const shopSlug = productMatch?.[1] ?? pathname.slice(1);
  if (
    shopSlug.includes("/") ||
    RESERVED_SHOP_SLUGS.has(shopSlug) ||
    !SHOP_SLUG_PATTERN.test(shopSlug)
  ) {
    return false;
  }

  return productMatch ? PRODUCT_ID_PATTERN.test(productMatch[2] ?? "") : true;
}

export function shouldMarkPublicPwaResponse(
  method: string,
  pathname: string,
  cookieHeader: string | null,
) {
  return method === "GET" && !cookieHeader && isPublicPwaPath(pathname);
}
