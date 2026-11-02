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
  "Accart-ville", "Belle-Ville", "Bolomakoté", "Colsama", "Dassasgho",
  "Dioulassoba", "Dogona", "Gounghin", "Koulouba", "Kibidoué",
  "Patte d’Oie", "Pissy", "Sarfalao", "Samandin", "Tanghin", "Tounouma",
  "Zone du Bois", "Zogona",
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
