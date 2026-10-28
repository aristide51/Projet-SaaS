import Link from "next/link";
import {
  BookingCalendar,
  type BookingAgendaEntry,
} from "@/features/bookings/booking-calendar";
import { BookingsWorkspace } from "@/features/bookings/booking-workspace";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

type BookingsPageProps = {
  searchParams: Promise<{ shop?: string }>;
};

function hasBookingsFeature(features: Json): boolean {
  return (
    typeof features === "object" &&
    features !== null &&
    !Array.isArray(features) &&
    features.bookings === true
  );
}

function rangeBounds(value: unknown): [string, string] {
  if (typeof value !== "string") {
    throw new Error("Un créneau de rendez-vous est invalide.");
  }
  const range = value.replace(/^[[(]/, "").replace(/[)\]]$/, "");
  const separator = range.indexOf(",");
  const startsAt = range
    .slice(0, separator)
    .replaceAll('"', "")
    .replace(" ", "T")
    .replace(/([+-]\d{2})$/, "$1:00");
  const endsAt = range
    .slice(separator + 1)
    .replaceAll('"', "")
    .replace(" ", "T")
    .replace(/([+-]\d{2})$/, "$1:00");
  if (
    separator < 0 ||
    !Number.isFinite(Date.parse(startsAt)) ||
    !Number.isFinite(Date.parse(endsAt))
  ) {
    throw new Error("Un créneau de rendez-vous est invalide.");
  }
  return [new Date(startsAt).toISOString(), new Date(endsAt).toISOString()];
}

export default async function BookingsPage({
  searchParams,
}: BookingsPageProps) {
  const user = await requireVerifiedUser();
  const params = await searchParams;
  const supabase = await createClient();
  const { data: memberships, error: membershipsError } = await supabase
    .from("shop_members")
    .select("shop_id, role, permissions")
    .eq("user_id", user.id);

  if (membershipsError) {
    throw new Error("Impossible de vérifier tes droits sur les boutiques.", {
      cause: membershipsError,
    });
  }

  const bookingMemberships = (memberships ?? []).filter((membership) => {
    const permissions =
      typeof membership.permissions === "object" &&
      membership.permissions !== null &&
      !Array.isArray(membership.permissions)
        ? membership.permissions
        : {};
    return membership.role === "owner" || permissions.bookings === true;
  });
  const shopIds = bookingMemberships.map((membership) => membership.shop_id);

  if (shopIds.length === 0) {
    return (
      <section className="team-section" role="alert">
        <h1>Agenda et rendez-vous</h1>
        <p>
          Tu n’as pas de boutique avec la permission « rendez-vous ». Demande au
          propriétaire de t’accorder ce droit.
        </p>
      </section>
    );
  }

  const { data: shops, error: shopsError } = await supabase
    .from("shops")
    .select("id, name")
    .in("id", shopIds)
    .order("created_at", { ascending: false });

  if (shopsError) {
    throw new Error("Impossible de charger tes boutiques.", {
      cause: shopsError,
    });
  }

  const availableShops = shops ?? [];
  const shop = params.shop
    ? availableShops.find((item) => item.id === params.shop)
    : availableShops[0];

  if (!shop) {
    return (
      <section className="team-section" role="alert">
        <h1>Boutique introuvable</h1>
        <p>Tu n’as pas accès à l’agenda de cette boutique.</p>
        <Link className="ui-button ui-button--secondary" href="/dashboard">
          Retour au tableau de bord
        </Link>
      </section>
    );
  }

  const [subscriptionResult, settingsResult] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("plan_id, status")
      .eq("shop_id", shop.id)
      .maybeSingle(),
    supabase
      .from("shop_settings")
      .select(
        "shop_id, booking_min_notice_hours, booking_auto_confirm, booking_cancel_before_hours",
      )
      .eq("shop_id", shop.id)
      .maybeSingle(),
  ]);
  if (subscriptionResult.error || settingsResult.error) {
    throw new Error("Impossible de charger les réglages de rendez-vous.", {
      cause: subscriptionResult.error ?? settingsResult.error,
    });
  }

  const subscription = subscriptionResult.data;
  const planQuery =
    subscription?.status !== "expired" && subscription?.plan_id
      ? supabase
          .from("plans")
          .select("features")
          .eq("id", subscription.plan_id)
          .maybeSingle()
      : supabase
          .from("plans")
          .select("features")
          .eq("code", "free")
          .maybeSingle();
  const { data: plan, error: planError } = await planQuery;
  if (planError || !plan) {
    throw new Error("Impossible de vérifier les options du plan.", {
      cause: planError,
    });
  }

  if (!hasBookingsFeature(plan.features)) {
    return (
      <section className="team-section">
        <h1>Agenda et rendez-vous</h1>
        <p>
          La gestion des rendez-vous est réservée au plan Pro. Tes services et
          tes données ne sont pas supprimés si ton abonnement expire.
        </p>
        <Link
          className="ui-button ui-button--primary"
          href={`/dashboard/abonnement?shop=${encodeURIComponent(shop.id)}`}
        >
          Découvrir le plan Pro
        </Link>
      </section>
    );
  }

  if (!settingsResult.data) {
    throw new Error("Les réglages de cette boutique sont introuvables.");
  }

  const [
    resourcesResult,
    rulesResult,
    timeOffResult,
    servicesResult,
    bookingsResult,
  ] =
    await Promise.all([
      supabase
        .from("resources")
        .select("id, shop_id, name, active")
        .eq("shop_id", shop.id)
        .order("name"),
      supabase
        .from("availability_rules")
        .select("id, shop_id, resource_id, weekday, start_time, end_time")
        .eq("shop_id", shop.id)
        .order("weekday")
        .order("start_time"),
      supabase
        .from("time_off")
        .select("id, shop_id, resource_id, starts_at, ends_at, reason")
        .eq("shop_id", shop.id)
        .order("starts_at", { ascending: false }),
      supabase
        .from("services")
        .select(
          "id, shop_id, name, description, duration_min, price, deposit_amount, active",
        )
        .eq("shop_id", shop.id)
        .is("deleted_at", null)
        .order("name"),
      supabase
        .from("bookings")
        .select(
          "id, customer_name, customer_phone, during, status, service_id, resource_id",
        )
        .eq("shop_id", shop.id)
        .order("created_at", { ascending: false })
        .limit(300),
    ]);

  const dataError =
    resourcesResult.error ??
    rulesResult.error ??
    timeOffResult.error ??
    servicesResult.error ??
    bookingsResult.error;
  if (dataError) {
    throw new Error("Impossible de charger la configuration de l’agenda.", {
      cause: dataError,
    });
  }

  const resourceNames = new Map(
    (resourcesResult.data ?? []).map((resource) => [resource.id, resource.name]),
  );
  const serviceNames = new Map(
    (servicesResult.data ?? []).map((service) => [service.id, service.name]),
  );
  const agendaBookings: BookingAgendaEntry[] = (bookingsResult.data ?? []).map(
    (booking) => {
      const [starts_at, ends_at] = rangeBounds(booking.during);
      return {
        id: booking.id,
        customer_name: booking.customer_name,
        customer_phone: booking.customer_phone,
        starts_at,
        ends_at,
        status: booking.status,
        service_name: serviceNames.get(booking.service_id) ?? "Service",
        resource_id: booking.resource_id,
        resource_name: resourceNames.get(booking.resource_id) ?? "Ressource",
      };
    },
  );

  return (
    <>
      <BookingsWorkspace
        shop={shop}
        shops={availableShops}
        resources={resourcesResult.data ?? []}
        rules={rulesResult.data ?? []}
        timeOff={timeOffResult.data ?? []}
        services={servicesResult.data ?? []}
        settings={settingsResult.data}
      />
      <BookingCalendar
        shopId={shop.id}
        bookings={agendaBookings}
        resources={(resourcesResult.data ?? [])
          .filter((resource) => resource.active)
          .map(({ id, name }) => ({ id, name }))}
      />
    </>
  );
}
