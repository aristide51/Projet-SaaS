import Link from "next/link";
import { notFound } from "next/navigation";
import { BookingWidget } from "@/features/bookings/booking-widget";
import { getPublicShop } from "@/features/storefront/data";
import { createClient, getOptionalUser } from "@/lib/supabase/server";

type BookingPageProps = {
  params: Promise<{ shop: string }>;
  searchParams: Promise<{ service?: string }>;
};

export default async function PublicBookingsPage({
  params,
  searchParams,
}: BookingPageProps) {
  const [{ shop: slug }, search, user] = await Promise.all([
    params,
    searchParams,
    getOptionalUser(),
  ]);
  const shop = await getPublicShop(slug);
  if (!shop) notFound();

  const supabase = await createClient();
  const [servicesResult, resourcesResult] = await Promise.all([
    supabase
      .from("services")
      .select("id, name, description, duration_min, price, deposit_amount")
      .eq("shop_id", shop.id)
      .eq("active", true)
      .eq("is_sample", false)
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("resources")
      .select("id, name")
      .eq("shop_id", shop.id)
      .eq("active", true)
      .order("name"),
  ]);

  if (servicesResult.error || resourcesResult.error) {
    throw new Error("Impossible de charger les services et disponibilités.", {
      cause: servicesResult.error ?? resourcesResult.error,
    });
  }

  if (!user?.email_confirmed_at) {
    const next = `/${encodeURIComponent(shop.slug)}/bookings`;
    return (
      <main className="public-shop-shell">
        <section className="customer-booking">
          <p className="auth-eyebrow">Réservation en ligne</p>
          <h1>Prendre rendez-vous chez {shop.name}</h1>
          <p>
            Connecte-toi avec une adresse e-mail confirmée pour consulter les
            créneaux et réserver.
          </p>
          <Link
            className="ui-button ui-button--primary"
            href={`/auth/login?next=${encodeURIComponent(next)}`}
          >
            Se connecter pour réserver
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="public-shop-shell">
      <BookingWidget
        initialServiceId={search.service ?? null}
        resources={resourcesResult.data ?? []}
        services={servicesResult.data ?? []}
        shop={{ id: shop.id, name: shop.name, slug: shop.slug }}
      />
      <p className="customer-booking__back">
        <Link href={`/${encodeURIComponent(shop.slug)}`}>
          Retour à la boutique
        </Link>
      </p>
    </main>
  );
}
