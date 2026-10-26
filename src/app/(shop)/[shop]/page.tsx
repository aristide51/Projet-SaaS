import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { AddToCartButton } from "@/features/cart/storefront-cart";
import {
  getPublicCatalog,
  getPublicShop,
  getPublicStorageUrl,
} from "@/features/storefront/data";
import {
  getOpeningHoursList,
  getOpeningStatus,
} from "@/features/storefront/opening-hours";

type PublicShopPageProps = {
  params: Promise<{ shop: string }>;
  searchParams: Promise<{
    q?: string | string[];
    categorie?: string | string[];
  }>;
};

export async function generateMetadata({
  params,
}: Pick<PublicShopPageProps, "params">): Promise<Metadata> {
  const { shop: slug } = await params;
  const shop = await getPublicShop(slug);
  if (!shop) return { title: "Boutique introuvable" };

  const image = shop.logo_path
    ? getPublicStorageUrl(shop.logo_path)
    : undefined;
  return {
    title: shop.name,
    description:
      shop.description ??
      `Découvre les produits et services de ${shop.name} à ${shop.city}.`,
    openGraph: {
      title: shop.name,
      description: shop.description ?? `La vitrine de ${shop.name}.`,
      ...(image
        ? { images: [{ url: image, alt: `Logo de ${shop.name}` }] }
        : {}),
    },
  };
}

export default async function PublicShopPage({
  params,
  searchParams,
}: PublicShopPageProps) {
  const [{ shop: slug }, search] = await Promise.all([params, searchParams]);
  const shop = await getPublicShop(slug);
  if (!shop) notFound();

  const query = firstQueryValue(search.q).slice(0, 100);
  const requestedCategory = firstQueryValue(search.categorie);
  const categoryId = UUID_PATTERN.test(requestedCategory)
    ? requestedCategory
    : null;
  const catalog = await getPublicCatalog(shop.id, query, categoryId);
  const logoUrl = shop.logo_path ? getPublicStorageUrl(shop.logo_path) : null;
  const openingStatus = getOpeningStatus(shop.opening_hours);
  const openingHours = getOpeningHoursList(shop.opening_hours);
  const mapUrl =
    shop.lat !== null && shop.lng !== null
      ? `https://www.google.com/maps/search/?api=1&query=${shop.lat},${shop.lng}`
      : null;
  const theme = { "--shop-brand-color": shop.brand_color } as CSSProperties;

  return (
    <main className="public-shop-shell" style={theme}>
      <header className="public-shop-header">
        {logoUrl ? (
          <Image
            alt={`Logo de ${shop.name}`}
            className="public-shop-header__image"
            height={88}
            src={logoUrl}
            unoptimized
            width={88}
          />
        ) : (
          <div className="public-shop-logo" aria-hidden="true">
            {getInitials(shop.name)}
          </div>
        )}
        <div className="public-shop-header__identity">
          <p className="auth-eyebrow">{shopCategoryLabel(shop.category)}</p>
          <h1>{shop.name}</h1>
          <p>{[shop.district, shop.city].filter(Boolean).join(", ")}</p>
          <p
            aria-label={openingStatus.label}
            className={`public-shop-status ${openingStatus.isOpen ? "is-open" : "is-closed"}`}
          >
            <span aria-hidden="true" />
            {openingStatus.label}
          </p>
        </div>
      </header>

      {shop.description ? (
        <p className="public-shop-description">{shop.description}</p>
      ) : null}

      <nav aria-label="Contacter la boutique" className="public-shop-actions">
        {shop.whatsapp ? (
          <a
            className="ui-button ui-button--primary public-shop-brand-button"
            href={`https://wa.me/${shop.whatsapp.replace(/\D/g, "")}`}
            rel="noreferrer"
            target="_blank"
          >
            Écrire sur WhatsApp
          </a>
        ) : null}
        {shop.phone ? (
          <a
            className="ui-button ui-button--secondary"
            href={`tel:${shop.phone}`}
          >
            Appeler la boutique
          </a>
        ) : null}
        {mapUrl ? (
          <a
            className="ui-button ui-button--secondary"
            href={mapUrl}
            rel="noreferrer"
            target="_blank"
          >
            Voir sur la carte
          </a>
        ) : null}
      </nav>

      <section
        aria-labelledby="storefront-catalog-title"
        className="public-shop-catalog"
      >
        <div className="public-shop-section-heading">
          <div>
            <p className="auth-eyebrow">La sélection de la boutique</p>
            <h2 id="storefront-catalog-title">Produits et services</h2>
          </div>
          <span>{catalog.items.length} résultat(s)</span>
        </div>

        <form
          action={`/${encodeURIComponent(shop.slug)}`}
          className="public-shop-search"
        >
          <label htmlFor="storefront-search">Rechercher dans la boutique</label>
          <div className="public-shop-search__controls">
            <input
              autoComplete="off"
              id="storefront-search"
              maxLength={100}
              name="q"
              placeholder="Ex. marteau, vidange…"
              type="search"
              defaultValue={query}
            />
            <select
              aria-label="Filtrer par catégorie"
              defaultValue={categoryId ?? ""}
              name="categorie"
            >
              <option value="">Toutes les catégories</option>
              {catalog.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {categoryLabel(category, catalog.categories)}
                </option>
              ))}
            </select>
            <button
              className="ui-button ui-button--primary public-shop-brand-button"
              type="submit"
            >
              Rechercher
            </button>
          </div>
        </form>

        {catalog.items.length ? (
          <ul className="public-shop-product-grid">
            {catalog.items.map((item) => {
              const image = catalog.images.find(
                (candidate) =>
                  candidate.product_id === item.id ||
                  candidate.service_id === item.id,
              );
              const card = (
                <>
                  <div className="public-shop-product-image">
                    {image ? (
                      <Image
                        alt=""
                        fill
                        sizes="(max-width: 42rem) 100vw, (max-width: 70rem) 50vw, 25vw"
                        src={getPublicStorageUrl(image.path)}
                        unoptimized
                      />
                    ) : (
                      <span aria-hidden="true">
                        {item.item_type === "product" ? "Article" : "Service"}
                      </span>
                    )}
                  </div>
                  <div className="public-shop-product-content">
                    <small>
                      {item.item_type === "product" ? "Produit" : "Service"}
                      {item.status === "out_of_stock"
                        ? " · Rupture de stock"
                        : ""}
                    </small>
                    <h3>{item.name}</h3>
                    {item.description ? <p>{item.description}</p> : null}
                    <strong>{formatPrice(item.price)}</strong>
                    {item.compare_at_price !== null ? (
                      <del>{formatPrice(item.compare_at_price)}</del>
                    ) : null}
                  </div>
                </>
              );

              return (
                <li key={`${item.item_type}-${item.id}`}>
                  {item.item_type === "product" ? (
                    <div className="public-shop-product-entry">
                      <Link
                        aria-label={`Voir ${item.name}`}
                        className="public-shop-product-card"
                        href={`/${encodeURIComponent(shop.slug)}/products/${item.id}`}
                      >
                        {card}
                      </Link>
                      <AddToCartButton
                        disabled={item.status !== "available"}
                        price={item.price}
                        productId={item.id}
                        productName={item.name}
                        variantId={null}
                      />
                    </div>
                  ) : (
                    <article className="public-shop-product-card">
                      {card}
                    </article>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="public-shop-empty">
            <h3>
              {query ? "Aucun résultat trouvé" : "Le catalogue arrive bientôt"}
            </h3>
            <p>
              {query
                ? "Essaie un autre mot ou retire le filtre de catégorie."
                : "La boutique ajoutera bientôt ses produits et services."}
            </p>
          </div>
        )}
      </section>

      <section
        aria-labelledby="storefront-hours-title"
        className="public-shop-info"
      >
        <div>
          <p className="auth-eyebrow">Nous rendre visite</p>
          <h2 id="storefront-hours-title">Horaires d’ouverture</h2>
          <p>
            {[shop.address, shop.district, shop.city]
              .filter(Boolean)
              .join(", ")}
          </p>
        </div>
        <dl className="public-shop-hours">
          {openingHours.map((day) => (
            <div key={day.label}>
              <dt>{day.label}</dt>
              <dd>{day.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <footer className="public-shop-footer">
        {shop.rating_count ? (
          <p>
            Note moyenne :{" "}
            <strong>{Number(shop.rating_avg).toFixed(1)}/5</strong> (
            {shop.rating_count} avis)
          </p>
        ) : (
          <p>Cette boutique n’a pas encore reçu d’avis.</p>
        )}
      </footer>
    </main>
  );
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function firstQueryValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function shopCategoryLabel(category: string) {
  const labels: Record<string, string> = {
    hardware: "Quincaillerie",
    auto_parts: "Pièces détachées",
    garage: "Garage",
    salon: "Salon",
    other: "Commerce local",
  };
  return labels[category] ?? "Commerce local";
}

function categoryLabel(
  category: { id: string; name: string; parent_id: string | null },
  categories: { id: string; name: string; parent_id: string | null }[],
) {
  let depth = 0;
  let parentId = category.parent_id;
  while (parentId && depth < categories.length) {
    const parent = categories.find((candidate) => candidate.id === parentId);
    if (!parent) break;
    depth += 1;
    parentId = parent.parent_id;
  }
  return `${"— ".repeat(depth)}${category.name}`;
}

function formatPrice(price: number) {
  return `${new Intl.NumberFormat("fr-FR").format(price)} FCFA`;
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toLocaleUpperCase("fr");
}
