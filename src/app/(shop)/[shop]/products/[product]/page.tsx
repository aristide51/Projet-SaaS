import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { after } from "next/server";
import { ProductPurchaseControls } from "@/features/cart/product-purchase-controls";
import {
  getPublicProduct,
  getPublicShop,
  getPublicStorageUrl,
  recordPublicStorefrontVisit,
  getReviewPhotoUrl,
  getStorefrontReviews,
} from "@/features/storefront/data";
import { StorefrontReviews } from "@/features/reviews/storefront-reviews";
import { absoluteSiteUrl } from "@/lib/site-url";
import { logError } from "@/lib/monitoring/sentry";
import { StorefrontShare } from "@/features/storefront/storefront-share";
import { encodeShortProductId } from "@/features/storefront/short-links";

type ProductPageProps = {
  params: Promise<{ shop: string; product: string }>;
};

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { shop: slug, product: productId } = await params;
  if (!UUID_PATTERN.test(productId)) return { title: "Produit introuvable" };
  const shop = await getPublicShop(slug);
  if (!shop) return { title: "Boutique introuvable" };
  const product = await getPublicProduct(shop.id, productId);
  if (!product) return { title: "Produit introuvable" };

  const image = product.images[0]
    ? getPublicStorageUrl(product.images[0].path)
    : shop.logo_path
      ? getPublicStorageUrl(shop.logo_path)
      : undefined;
  const canonical = absoluteSiteUrl(
    `/${encodeURIComponent(shop.slug)}/products/${product.id}`,
  );
  const location = [shop.district, shop.city].filter(Boolean).join(", ");
  const price = `${new Intl.NumberFormat("fr-FR").format(product.price)} FCFA`;
  const title = `${product.name} — ${price} | ${shop.name} à ${location}`;
  const description = [
    `${product.name}, ${price} chez ${shop.name} à ${location}.`,
    product.description,
  ]
    .filter(Boolean)
    .join(" ");
  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: true, follow: true },
    openGraph: {
      title,
      description,
      url: canonical,
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

export default async function PublicProductPage({ params }: ProductPageProps) {
  const { shop: slug, product: productId } = await params;
  if (!UUID_PATTERN.test(productId)) notFound();

  const shop = await getPublicShop(slug);
  if (!shop) notFound();
  const product = await getPublicProduct(shop.id, productId);
  if (!product) notFound();
  after(() =>
    recordPublicStorefrontVisit(shop.id, product.id).catch(
      (error: unknown) =>
        logError("storefront_visit_record_failed", error),
    ),
  );
  const reviewRows = await getStorefrontReviews(shop.id, product.id);
  const reviews = reviewRows.map((review) => ({
    ...review,
    photoUrls: review.photo_paths.map(getReviewPhotoUrl),
  }));
  const rating = reviewRows[0];
  const shortProductCode = encodeShortProductId(product.id);
  if (!shortProductCode) {
    throw new Error("Impossible de créer le lien court de ce produit.");
  }
  const structuredProduct = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    url: absoluteSiteUrl(
      `/${encodeURIComponent(shop.slug)}/products/${product.id}`,
    ),
    description: product.description ?? undefined,
    image: product.images.map((image) => getPublicStorageUrl(image.path)),
    offers: {
      "@type": "Offer",
      priceCurrency: "XOF",
      price: product.price,
      availability:
        product.status === "available"
          ? "https://schema.org/InStock"
          : "https://schema.org/OutOfStock",
    },
    ...(rating
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: rating.rating_average,
            reviewCount: rating.review_count,
            bestRating: 5,
            worstRating: 1,
          },
        }
      : {}),
  };

  const theme = { "--shop-brand-color": shop.brand_color } as CSSProperties;
  const whatsappMessage = encodeURIComponent(
    `Bonjour, je souhaite en savoir plus sur ${product.name}.`,
  );

  return (
    <main className="public-shop-shell" style={theme}>
      <script
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredProduct).replace(/</g, "\\u003c"),
        }}
        type="application/ld+json"
      />
      <nav aria-label="Fil d’Ariane" className="public-shop-breadcrumb">
        <Link href={`/${encodeURIComponent(shop.slug)}`}>{shop.name}</Link>
        <span aria-hidden="true">/</span>
        <span>{product.name}</span>
      </nav>

      <article className="public-product-detail">
        <div className="public-product-gallery">
          {product.images.length ? (
            product.images.map((image, index) => (
              <div className="public-product-image" key={image.path}>
                <Image
                  alt={`${product.name}${index ? `, photo ${index + 1}` : ""}`}
                  fill
                  priority={index === 0}
                  sizes="(max-width: 42rem) 100vw, 50vw"
                  src={getPublicStorageUrl(image.path)}
                  unoptimized
                />
              </div>
            ))
          ) : (
            <div className="public-product-image public-product-image--empty">
              <span>Photo non disponible</span>
            </div>
          )}
        </div>

        <div className="public-product-copy">
          {product.category_name ? (
            <p className="auth-eyebrow">{product.category_name}</p>
          ) : null}
          <h1>{product.name}</h1>
          <p className="public-product-price">{formatPrice(product.price)}</p>
          {product.compare_at_price !== null &&
          product.compare_at_price > product.price ? (
            <span className="public-promo-badge">Promo</span>
          ) : null}
          {product.compare_at_price !== null ? (
            <p className="public-product-compare">
              Prix précédent :{" "}
              <del>{formatPrice(product.compare_at_price)}</del>
            </p>
          ) : null}
          {product.status === "out_of_stock" ? (
            <p className="public-product-stock">
              Actuellement en rupture de stock
            </p>
          ) : (
            <p className="public-product-stock is-available">Disponible</p>
          )}
          {product.description ? (
            <p className="public-product-description">{product.description}</p>
          ) : null}
          <ProductPurchaseControls
            basePrice={product.price}
            productAvailable={product.status === "available"}
            productId={product.id}
            productName={product.name}
            variants={product.variants}
          />
          {shop.whatsapp ? (
            <a
              className="ui-button ui-button--secondary"
              href={`https://wa.me/${shop.whatsapp.replace(/\D/g, "")}?text=${whatsappMessage}`}
              rel="noreferrer"
              target="_blank"
            >
              Demander à la boutique
            </a>
          ) : null}
          {shop.phone ? (
            <a className="ui-button ui-button--secondary" href={`tel:${shop.phone}`}>
              Appeler la boutique
            </a>
          ) : null}
          <StorefrontShare
            product={{
              id: product.id,
              name: product.name,
              price: product.price,
            }}
            shareUrl={absoluteSiteUrl(`/p/${shortProductCode}`)}
            shopName={shop.name}
            shopSlug={shop.slug}
          />
        </div>
      </article>
      <StorefrontReviews reviews={reviews} title={`Avis sur ${product.name}`} />
    </main>
  );
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formatPrice(price: number) {
  return `${new Intl.NumberFormat("fr-FR").format(price)} FCFA`;
}
