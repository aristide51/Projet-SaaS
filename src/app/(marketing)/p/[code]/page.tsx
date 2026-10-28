import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import {
  getPublicProduct,
  getPublicProductLinkTarget,
  getPublicShop,
  getPublicStorageUrl,
} from "@/features/storefront/data";
import { absoluteSiteUrl } from "@/lib/site-url";
import { decodeShortProductId } from "@/features/storefront/short-links";

type ShortProductLinkProps = {
  params: Promise<{ code: string }>;
};

async function loadPublicProduct(code: string) {
  const productId = decodeShortProductId(code);
  if (!productId) return null;

  const target = await getPublicProductLinkTarget(productId);
  if (!target) return null;
  const [shop, product] = await Promise.all([
    getPublicShop(target.shopSlug),
    getPublicProduct(target.shopId, productId),
  ]);
  if (!shop || !product) return null;

  return { shop, product };
}

export async function generateMetadata({
  params,
}: ShortProductLinkProps): Promise<Metadata> {
  const { code } = await params;
  const result = await loadPublicProduct(code);
  if (!result) {
    return {
      title: "Produit introuvable",
      robots: { index: false, follow: false },
    };
  }

  const { shop, product } = result;
  const shortUrl = absoluteSiteUrl(`/p/${code}`);
  const canonical = absoluteSiteUrl(
    `/${encodeURIComponent(shop.slug)}/products/${product.id}`,
  );
  const location = [shop.district, shop.city].filter(Boolean).join(", ");
  const image = product.images[0]
    ? getPublicStorageUrl(product.images[0].path)
    : shop.logo_path
      ? getPublicStorageUrl(shop.logo_path)
      : undefined;
  const price = `${new Intl.NumberFormat("fr-FR").format(product.price)} FCFA`;
  const description =
    product.description ??
    `${product.name} à ${price}, chez ${shop.name} à ${location}.`;
  const title = `${product.name} — ${price} | ${shop.name}`;

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: false, follow: true },
    openGraph: {
      type: "website",
      title,
      description,
      url: shortUrl,
      ...(image ? { images: [{ url: image, alt: product.name }] } : {}),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    },
  };
}

export default async function ShortProductLink({
  params,
}: ShortProductLinkProps) {
  const { code } = await params;
  const result = await loadPublicProduct(code);
  if (!result) notFound();

  permanentRedirect(
    `/${encodeURIComponent(result.shop.slug)}/products/${result.product.id}`,
  );
}
