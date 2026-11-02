import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import {
  getPublicStorageUrl,
  searchPublicShops,
  type ShopDirectoryFilters,
} from "@/features/storefront/data";
import { MarketingHeader } from "@/components/design/marketing-header";
import { absoluteSiteUrl } from "@/lib/site-url";

type DirectorySearchParams = {
  q?: string | string[];
  ville?: string | string[];
  quartier?: string | string[];
  categorie?: string | string[];
  ouvert?: string | string[];
  note?: string | string[];
  promo?: string | string[];
  tri?: string | string[];
  centre?: string | string[];
  curseur?: string | string[];
  curseur_id?: string | string[];
};

type DirectoryPageProps = {
  searchParams: Promise<DirectorySearchParams>;
};

const CATEGORIES = {
  hardware: "Quincaillerie",
  auto_parts: "Pièces détachées",
  garage: "Garage",
  salon: "Salon",
  other: "Autre commerce",
} as const;

const CENTERS = {
  Ouagadougou: { latitude: 12.3714, longitude: -1.5197 },
  "Bobo-Dioulasso": { latitude: 11.1772, longitude: -4.2979 },
} as const;

const NEIGHBORHOODS = [
  "Accart-ville",
  "Belle-Ville",
  "Bolomakoté",
  "Colsama",
  "Dassasgho",
  "Dioulassoba",
  "Dogona",
  "Gounghin",
  "Koulouba",
  "Kibidoué",
  "Patte d’Oie",
  "Pissy",
  "Sarfalao",
  "Samandin",
  "Tanghin",
  "Tounouma",
  "Zone du Bois",
  "Zogona",
];

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function generateMetadata({
  searchParams,
}: DirectoryPageProps): Promise<Metadata> {
  const search = await searchParams;
  const city = firstValue(search.ville).trim();
  const title = city ? `Boutiques à ${city}` : "Annuaire des boutiques locales";
  return {
    title,
    description:
      "Trouve les commerces, boutiques et services près de toi au Burkina Faso.",
    alternates: { canonical: absoluteSiteUrl("/shops") },
    robots: { index: true, follow: true },
  };
}

export default async function ShopDirectoryPage({
  searchParams,
}: DirectoryPageProps) {
  const search = await searchParams;
  const parsed = parseFilters(search);
  const shops = parsed.filters ? await searchPublicShops(parsed.filters) : [];
  const visibleShops = shops.slice(0, 12);
  const nextCursor = visibleShops.at(-1);
  const nextHref =
    nextCursor && shops.length > 12
      ? createNextHref(search, nextCursor.sort_value, nextCursor.shop_id)
      : null;
  const listStructuredData = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: visibleShops.map((shop, index) => ({
      "@type": "ListItem",
      position: index + 1,
      url: absoluteSiteUrl(`/${encodeURIComponent(shop.slug)}`),
      name: shop.name,
    })),
  };

  return (
    <main className="marketing-home directory-page min-h-screen">
      <MarketingHeader currentPath="/shops" />
      <div className="directory-content mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
        <nav aria-label="Fil d’Ariane" className="directory-breadcrumb">
          <Link className="underline underline-offset-4" href="/">
            Accueil
          </Link>
          <span aria-hidden="true"> / </span>
          <span>Annuaire</span>
        </nav>

        <header className="directory-intro">
          <p className="directory-kicker">L’annuaire des commerces locaux</p>
          <h1>Trouve une boutique près de chez toi.</h1>
          <p>
            Explore les boutiques, produits et services de Ouagadougou,
            Bobo-Dioulasso et de tout le Burkina Faso.
          </p>
        </header>

        <form action="/shops" className="directory-search-panel" method="get">
          <div className="directory-search-primary">
            <label className="directory-field directory-field--query">
              <span>Que recherches-tu ?</span>
              <input
                defaultValue={firstValue(search.q)}
                maxLength={100}
                name="q"
                placeholder="Nom d’une boutique"
                type="search"
              />
            </label>
            <label className="directory-field directory-field--city">
              <span>Dans quelle ville ?</span>
              <input
                defaultValue={firstValue(search.ville)}
                list="burkina-cities"
                maxLength={80}
                name="ville"
                placeholder="Ex. Ouagadougou"
              />
              <datalist id="burkina-cities">
                <option value="Ouagadougou" />
                <option value="Bobo-Dioulasso" />
              </datalist>
            </label>
            <button className="directory-search-button" type="submit">
              Rechercher <span aria-hidden="true">→</span>
            </button>
          </div>

          <div aria-hidden="true" className="directory-search-divider" />
          <div className="directory-filter-heading">
            <div>
              <p>Affiner la recherche</p>
              <span>Choisis les critères qui comptent pour toi.</span>
            </div>
          </div>
          <div className="directory-filter-grid">
            <label className="directory-field">
              <span>Quartier</span>
              <input
                defaultValue={firstValue(search.quartier)}
                list="burkina-neighborhoods"
                maxLength={80}
                name="quartier"
                placeholder="Tous les quartiers"
              />
              <datalist id="burkina-neighborhoods">
                {NEIGHBORHOODS.map((neighborhood) => (
                  <option key={neighborhood} value={neighborhood} />
                ))}
              </datalist>
            </label>
            <label className="directory-field">
              <span>Catégorie</span>
              <select
                defaultValue={firstValue(search.categorie)}
                name="categorie"
              >
                <option value="">Toutes les catégories</option>
                {Object.entries(CATEGORIES).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="directory-field">
              <span>Note minimale</span>
              <select defaultValue={firstValue(search.note)} name="note">
                <option value="">Toutes les notes</option>
                <option value="3">3 étoiles</option>
                <option value="4">4 étoiles</option>
                <option value="4.5">4,5 étoiles</option>
              </select>
            </label>
            <label className="directory-field">
              <span>Trier par</span>
              <select
                defaultValue={firstValue(search.tri) || "relevance"}
                name="tri"
              >
                <option value="relevance">Pertinence</option>
                <option value="distance">Proximité</option>
                <option value="rating">Meilleures notes</option>
              </select>
            </label>
            <label className="directory-field">
              <span>Proximité depuis</span>
              <select
                defaultValue={firstValue(search.centre) || "Ouagadougou"}
                name="centre"
              >
                {Object.keys(CENTERS).map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="directory-filter-footer">
            <div className="directory-filter-options">
              <label>
                <input
                  defaultChecked={firstValue(search.ouvert) === "1"}
                  name="ouvert"
                  type="checkbox"
                  value="1"
                />
                <span>Ouvert maintenant</span>
              </label>
              <label>
                <input
                  defaultChecked={firstValue(search.promo) === "1"}
                  name="promo"
                  type="checkbox"
                  value="1"
                />
                <span>En promotion</span>
              </label>
            </div>
            <p>Tous les commerces sont situés au Burkina Faso.</p>
          </div>
        </form>

        {parsed.error ? (
          <p
            className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-red-900"
            role="alert"
          >
            {parsed.error}
          </p>
        ) : null}

        <section aria-labelledby="directory-results-heading">
          <div className="directory-results-heading">
            <div>
              <p className="directory-kicker">Sélection locale</p>
              <h2 id="directory-results-heading">Les boutiques à découvrir</h2>
            </div>
            <p aria-live="polite" className="directory-results-count">
              <strong>{visibleShops.length}</strong> résultat(s) sur cette page
            </p>
          </div>

          {visibleShops.length ? (
            <>
              <script
                dangerouslySetInnerHTML={{
                  __html: JSON.stringify(listStructuredData).replace(
                    /</g,
                    "\\u003c",
                  ),
                }}
                type="application/ld+json"
              />
              <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {visibleShops.map((shop) => (
                  <li key={shop.shop_id}>
                    <Link
                      className="directory-shop-card"
                      href={`/${encodeURIComponent(shop.slug)}`}
                    >
                      <div className="directory-shop-card__logo">
                        {shop.logo_path ? (
                          <Image
                            alt=""
                            className="object-cover"
                            fill
                            sizes="64px"
                            src={getPublicStorageUrl(shop.logo_path)}
                            unoptimized
                          />
                        ) : (
                          shop.name.slice(0, 1).toLocaleUpperCase("fr")
                        )}
                      </div>
                      <div className="directory-shop-card__content">
                        <p className="directory-shop-card__category">
                          {CATEGORIES[shop.category]}
                        </p>
                        <h3>{shop.name}</h3>
                        <p className="directory-shop-card__location">
                          {[shop.district, shop.city]
                            .filter(Boolean)
                            .join(", ")}
                        </p>
                        <div className="directory-shop-card__rating">
                          {shop.rating_count ? (
                            <>
                              <span aria-label={`${shop.rating_avg} sur 5`}>
                                ★ {Number(shop.rating_avg).toFixed(1)}
                              </span>
                              <span>({shop.rating_count} avis)</span>
                            </>
                          ) : (
                            <span>Pas encore d’avis</span>
                          )}
                        </div>
                        <div className="directory-shop-card__badges">
                          {shop.is_open_now ? (
                            <span className="directory-shop-card__badge directory-shop-card__badge--open">
                              Ouvert
                            </span>
                          ) : null}
                          {shop.has_promotion ? (
                            <span className="directory-shop-card__badge directory-shop-card__badge--promo">
                              En promotion
                            </span>
                          ) : null}
                          {shop.distance_km !== null ? (
                            <span className="directory-shop-card__distance">
                              À {Number(shop.distance_km).toFixed(1)} km
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
              {nextHref ? (
                <div className="directory-load-more">
                  <Link
                    className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white px-6 font-semibold hover:bg-slate-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700"
                    href={nextHref}
                  >
                    Voir plus de boutiques
                  </Link>
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center">
              <h3 className="text-lg font-semibold">
                Aucune boutique ne correspond à ces filtres
              </h3>
              <p className="mt-2 text-slate-600">
                Essaie une autre ville, une catégorie différente ou retire un
                filtre.
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

function firstValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function parseFilters(search: DirectorySearchParams): {
  filters: ShopDirectoryFilters | null;
  error: string | null;
} {
  const query = firstValue(search.q).trim();
  const city = firstValue(search.ville).trim();
  const district = firstValue(search.quartier).trim();
  const categoryValue = firstValue(search.categorie);
  const ratingValue = firstValue(search.note);
  const sortValue = firstValue(search.tri) || "relevance";
  const centerValue = firstValue(search.centre) || "Ouagadougou";
  const cursorValue = firstValue(search.curseur);
  const cursorId = firstValue(search.curseur_id);
  const openValue = firstValue(search.ouvert);
  const promotionValue = firstValue(search.promo);

  if (query.length > 100 || city.length > 80 || district.length > 80) {
    return { filters: null, error: "Un filtre dépasse la longueur autorisée." };
  }
  if (categoryValue && !isShopCategory(categoryValue)) {
    return { filters: null, error: "La catégorie sélectionnée est invalide." };
  }
  if (ratingValue && !["3", "4", "4.5"].includes(ratingValue)) {
    return {
      filters: null,
      error: "La note minimale sélectionnée est invalide.",
    };
  }
  if (!isDirectorySort(sortValue)) {
    return { filters: null, error: "Le tri sélectionné est invalide." };
  }
  if (!isCenter(centerValue)) {
    return {
      filters: null,
      error: "La ville de proximité sélectionnée est invalide.",
    };
  }
  if (openValue && openValue !== "1") {
    return { filters: null, error: "Le filtre d’ouverture est invalide." };
  }
  if (promotionValue && promotionValue !== "1") {
    return { filters: null, error: "Le filtre de promotion est invalide." };
  }
  if (
    (cursorValue || cursorId) &&
    (!cursorValue ||
      !cursorId ||
      !UUID_PATTERN.test(cursorId) ||
      !Number.isFinite(Number(cursorValue)))
  ) {
    return { filters: null, error: "Le curseur de pagination est invalide." };
  }

  const center = CENTERS[centerValue];
  const category = isShopCategory(categoryValue) ? categoryValue : null;
  return {
    filters: {
      query,
      city,
      district,
      category,
      openNow: openValue === "1",
      minimumRating: ratingValue ? Number(ratingValue) : null,
      hasPromotion: promotionValue === "1",
      sort: sortValue,
      latitude: sortValue === "distance" ? center.latitude : null,
      longitude: sortValue === "distance" ? center.longitude : null,
      cursor:
        cursorValue && cursorId
          ? { value: Number(cursorValue), id: cursorId }
          : null,
    },
    error: null,
  };
}

function isShopCategory(value: string): value is keyof typeof CATEGORIES {
  return Object.hasOwn(CATEGORIES, value);
}

function isCenter(value: string): value is keyof typeof CENTERS {
  return Object.hasOwn(CENTERS, value);
}

function isDirectorySort(value: string): value is ShopDirectoryFilters["sort"] {
  return value === "relevance" || value === "distance" || value === "rating";
}

function createNextHref(
  search: DirectorySearchParams,
  cursorValue: number,
  cursorId: string,
) {
  const values: Record<string, string> = {
    q: firstValue(search.q),
    ville: firstValue(search.ville),
    quartier: firstValue(search.quartier),
    categorie: firstValue(search.categorie),
    note: firstValue(search.note),
    tri: firstValue(search.tri) || "relevance",
    centre: firstValue(search.centre) || "Ouagadougou",
    ouvert: firstValue(search.ouvert),
    promo: firstValue(search.promo),
    curseur: String(cursorValue),
    curseur_id: cursorId,
  };
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value) params.set(key, value);
  }
  return `/shops?${params.toString()}`;
}
