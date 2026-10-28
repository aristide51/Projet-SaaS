import Link from "next/link";
import { CustomerBookings } from "@/features/bookings/customer-bookings";
import type { CustomerBookingView } from "@/features/bookings/customer-bookings";
import { getUser } from "@/lib/supabase/server";
import { createClient } from "@/lib/supabase/server";

function parseRange(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("Un rendez-vous contient un horaire invalide.");
  }

  const comma = value.indexOf(",");
  if (comma < 0) {
    throw new Error("Un rendez-vous contient un horaire invalide.");
  }

  const parseBound = (bound: string) => {
    const unquoted = bound.trim().replace(/^["']|["']$/g, "");
    const iso = unquoted
      .replace(/^(\d{4}-\d{2}-\d{2}) /, "$1T")
      .replace(/([+-]\d{2})$/, "$1:00");
    const date = new Date(iso);
    if (Number.isNaN(date.valueOf())) {
      throw new Error("Un rendez-vous contient un horaire invalide.");
    }
    return date.toISOString();
  };

  return {
    startsAt: parseBound(value.slice(1, comma)),
    endsAt: parseBound(value.slice(comma + 1, -1)),
  };
}

export default async function CustomerBookingsPage() {
  const user = await getUser();
  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("bookings")
    .select(
      "id, shop_id, service_id, resource_id, during, status, customer_note, cancelled_reason",
    )
    .eq("customer_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error("Impossible de charger tes rendez-vous.", { cause: error });
  }

  const shopIds = [...new Set((rows ?? []).map((booking) => booking.shop_id))];
  const serviceIds = [
    ...new Set((rows ?? []).map((booking) => booking.service_id)),
  ];
  const resourceIds = [
    ...new Set((rows ?? []).map((booking) => booking.resource_id)),
  ];
  const completedBookingIds = (rows ?? [])
    .filter((booking) => booking.status === "completed")
    .map((booking) => booking.id);
  const [shopsResult, servicesResult, resourcesResult, reviewsResult] =
    await Promise.all([
      shopIds.length
        ? supabase.from("shops").select("id, name, slug").in("id", shopIds)
        : Promise.resolve({ data: [], error: null }),
      serviceIds.length
        ? supabase.from("services").select("id, name").in("id", serviceIds)
        : Promise.resolve({ data: [], error: null }),
      resourceIds.length
        ? supabase.from("resources").select("id, name").in("id", resourceIds)
        : Promise.resolve({ data: [], error: null }),
      completedBookingIds.length
        ? supabase
            .from("reviews")
            .select("booking_id")
            .eq("customer_id", user.id)
            .in("booking_id", completedBookingIds)
        : Promise.resolve({ data: [], error: null }),
    ]);
  const relatedError =
    shopsResult.error ??
    servicesResult.error ??
    resourcesResult.error ??
    reviewsResult.error;
  if (relatedError) {
    throw new Error("Impossible de charger les détails des rendez-vous.", {
      cause: relatedError,
    });
  }

  const shops = new Map(
    (shopsResult.data ?? []).map((shop) => [shop.id, shop]),
  );
  const services = new Map(
    (servicesResult.data ?? []).map((service) => [service.id, service.name]),
  );
  const resources = new Map(
    (resourcesResult.data ?? []).map((resource) => [
      resource.id,
      resource.name,
    ]),
  );
  const reviewedBookingIds = new Set(
    (reviewsResult.data ?? []).flatMap((review) =>
      review.booking_id ? [review.booking_id] : [],
    ),
  );
  const bookings: CustomerBookingView[] = (rows ?? []).map((booking) => {
    const shop = shops.get(booking.shop_id);
    const range = parseRange(booking.during);
    return {
      id: booking.id,
      shopId: booking.shop_id,
      status: booking.status,
      startsAt: range.startsAt,
      endsAt: range.endsAt,
      note: booking.customer_note,
      cancelledReason: booking.cancelled_reason,
      shopName: shop?.name ?? "Boutique indisponible",
      shopSlug: shop?.slug ?? "",
      reviewed: reviewedBookingIds.has(booking.id),
      serviceName: services.get(booking.service_id) ?? "Service indisponible",
      resourceName:
        resources.get(booking.resource_id) ?? "Ressource indisponible",
    };
  });

  return (
    <main className="auth-main">
      <section className="auth-card customer-bookings-page">
        <p className="auth-eyebrow">Mon compte</p>
        <h1>Mes rendez-vous</h1>
        <p className="auth-description">
          Consulte tes réservations et annule-les dans le délai prévu par la
          boutique.
        </p>
        <Link className="ui-button ui-button--secondary" href="/account">
          Retour à mon compte
        </Link>
        <CustomerBookings
          bookings={bookings}
          now={new Date().toISOString()}
          userId={user.id}
        />
      </section>
    </main>
  );
}
