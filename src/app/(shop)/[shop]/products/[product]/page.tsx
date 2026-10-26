import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { ProductPurchaseControls } from "@/features/cart/product-purchase-controls";
import {
  getPublicProduct,
  getPublicShop,
  getPublicStorageUrl,
} from "@/features/storefront/data";

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
  return {
    title: `${product.name} — ${shop.name}`,
    description:
      product.description ?? `${product.name}, disponible chez ${shop.name}.`,
    openGraph: {
      title: `${product.name} — ${shop.name}`,
      description:
        product.description ?? `${product.name}, disponible chez ${shop.name}.`,
      ...(image ? { images: [{ url: image, alt: product.name }] } : {}),
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

  const theme = { "--shop-brand-color": shop.brand_color } as CSSProperties;
  const whatsappMessage = encodeURIComponent(
    `Bonjour, je souhaite en savoir plus sur ${product.name}.`,
  );

  return (
    <main className="public-shop-shell" style={theme}>
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
        </div>
      </article>
    </main>
  );
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function formatPrice(price: number) {
  return `${new Intl.NumberFormat("fr-FR").format(price)} FCFA`;
}
