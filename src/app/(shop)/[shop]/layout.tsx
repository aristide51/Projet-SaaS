import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { StorefrontCartProvider } from "@/features/cart/storefront-cart";
import { hasGuestCartCookie } from "@/features/cart/data";
import { getPublicShop } from "@/features/storefront/data";
import { getSessionUser } from "@/lib/supabase/server";

export default async function PublicShopLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ shop: string }>;
}) {
  const { shop: slug } = await params;
  const shop = await getPublicShop(slug);
  if (!shop) notFound();

  const [hasGuestCart, user] = await Promise.all([
    hasGuestCartCookie(),
    getSessionUser(),
  ]);
  const cart = { items: [], quantity: 0, hasGuestCart };

  return (
    <StorefrontCartProvider
      cart={cart}
      isAuthenticated={Boolean(user?.email_confirmed_at)}
      key={shop.id}
      shopId={shop.id}
      shopName={shop.name}
      shopSlug={shop.slug}
    >
      <div className="public-storefront-layout">
        <header className="public-storefront-toolbar">
          <Link
            aria-label={`Accueil de ${shop.name}`}
            className="public-storefront-home-link"
            href={`/${encodeURIComponent(shop.slug)}`}
          >
            {shop.name}
          </Link>
          <span>{[shop.district, shop.city].filter(Boolean).join(", ")}</span>
        </header>
        {children}
      </div>
    </StorefrontCartProvider>
  );
}
