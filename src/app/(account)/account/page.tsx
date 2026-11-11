import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/features/auth/sign-out-button";
import { NotificationCenter } from "@/features/notifications/notification-center";
import {
  CustomerOrders,
  type CustomerOrder,
  type ShopSummary,
} from "@/features/orders/customer-orders";
import { CUSTOMER_ORDER_PAGE_SIZE } from "@/features/orders/types";
import { ProfileForm } from "@/features/profile/profile-form";
import { HeroScene } from "@/components/design/hero-scene";
import { hasRecentReauthentication } from "@/lib/security/reauth";
import { createClient, getUser } from "@/lib/supabase/server";
import { MotionSurface } from "@/components/design/motion-surface";

export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ ordersPage?: string }>;
}) {
  const user = await getUser();
  const params = await searchParams;
  const requestedPage = Number.parseInt(params.ordersPage ?? "1", 10);
  const currentPage =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;
  const start = (currentPage - 1) * CUSTOMER_ORDER_PAGE_SIZE;
  const supabase = await createClient();
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("full_name, phone, avatar_url")
    .eq("id", user.id)
    .single();

  if (profileError) {
    throw new Error("Impossible de charger le profil.", {
      cause: profileError,
    });
  }

  const [
    { data: orderRows, error: ordersError, count: ordersCount },
    reauthVerified,
  ] = await Promise.all([
    supabase
      .from("orders")
      .select(
        "id, code, shop_id, status, payment_method, fulfillment, total, created_at, delivery_address, note, order_items(id, name_snapshot, unit_price, quantity), order_status_history(id, from_status, to_status, created_at, note)",
        { count: "exact" },
      )
      .eq("customer_id", user.id)
      .order("created_at", { ascending: false })
      .range(start, start + CUSTOMER_ORDER_PAGE_SIZE - 1),
    hasRecentReauthentication(user.id),
  ]);

  if (ordersError) {
    throw new Error("Impossible de charger tes commandes.", {
      cause: ordersError,
    });
  }

  const totalOrders = ordersCount ?? 0;
  const totalPages = Math.max(
    1,
    Math.ceil(totalOrders / CUSTOMER_ORDER_PAGE_SIZE),
  );

  if (currentPage > totalPages) {
    redirect(
      totalPages === 1 ? "/account" : `/account?ordersPage=${totalPages}`,
    );
  }

  const orderIds = (orderRows ?? []).map((order) => order.id);
  const shopIds = [...new Set((orderRows ?? []).map((order) => order.shop_id))];
  const { data: shops, error: shopsError } = shopIds.length
    ? await supabase.from("shops").select("id, name, slug").in("id", shopIds)
    : { data: [], error: null };
  const { data: cancellationRequests, error: requestsError } = orderIds.length
    ? await supabase
        .from("order_cancellation_requests")
        .select(
          "id, order_id, status, customer_note, resolution_note, requested_at, resolved_at",
        )
        .in("order_id", orderIds)
        .order("requested_at", { ascending: false })
    : { data: [], error: null };
  const completedOrderIds = (orderRows ?? [])
    .filter((order) => order.status === "completed")
    .map((order) => order.id);
  const { data: customerReviews, error: customerReviewsError } =
    completedOrderIds.length
      ? await supabase
          .from("reviews")
          .select("order_id")
          .eq("customer_id", user.id)
          .in("order_id", completedOrderIds)
      : { data: [], error: null };

  if (shopsError) {
    throw new Error("Impossible de charger les boutiques de tes commandes.", {
      cause: shopsError,
    });
  }
  if (requestsError) {
    throw new Error("Impossible de charger les demandes d’annulation.", {
      cause: requestsError,
    });
  }
  if (customerReviewsError) {
    throw new Error("Impossible de vérifier les avis déjà publiés.", {
      cause: customerReviewsError,
    });
  }

  const latestRequestByOrder = new Map<
    string,
    NonNullable<typeof cancellationRequests>[number]
  >();

  for (const request of cancellationRequests ?? []) {
    if (!latestRequestByOrder.has(request.order_id)) {
      latestRequestByOrder.set(request.order_id, request);
    }
  }

  const reviewedOrderIds = new Set(
    (customerReviews ?? []).flatMap((review) =>
      review.order_id ? [review.order_id] : [],
    ),
  );
  const orders: CustomerOrder[] = (orderRows ?? []).map((order) => ({
    ...order,
    items: order.order_items ?? [],
    history: order.order_status_history ?? [],
    cancellationRequest: latestRequestByOrder.get(order.id) ?? null,
    reviewed: reviewedOrderIds.has(order.id),
  }));
  const shopSummaries: ShopSummary[] = shops ?? [];
  const completedOrders = orders.filter(
    (order) => order.status === "completed",
  );
  const totalSpent = completedOrders.reduce(
    (total, order) => total + order.total,
    0,
  );
  const initials =
    profile.full_name
      ?.trim()
      .split(/\s+/)
      .map((name) => name[0])
      .join("")
      .slice(0, 2)
      .toLocaleUpperCase("fr-FR") || "FS";

  return (
    <main className="account-main">
      <div className="account-wrapper">
        <section
          aria-labelledby="account-title"
          className="account-header"
          data-reveal
        >
          <div aria-hidden="true" className="account-header__scene">
            <HeroScene />
          </div>
          <div className="account-header__identity">
            <div className="account-header__avatar">
              {profile.avatar_url ? (
                <Image
                  alt=""
                  height={88}
                  src={profile.avatar_url}
                  unoptimized
                  width={88}
                />
              ) : (
                <span aria-hidden="true">{initials}</span>
              )}
            </div>
            <div className="account-header__info">
              <p className="account-header__eyebrow">Espace client</p>
              <h1 id="account-title">
                Bonjour, {profile.full_name?.trim().split(/\s+/)[0] || "toi"}.
              </h1>
              <p className="account-header__subtitle">
                Connecté avec {user.email}
              </p>
            </div>
          </div>
          <nav
            aria-label="Raccourcis du compte"
            className="quick-actions"
            data-stagger="account-actions"
            data-stagger-target=".quick-action"
          >
            <MotionSurface className="quick-action-motion">
              <Link className="quick-action" href="/account/bookings">
                <span aria-hidden="true" className="quick-action__icon">
                  ◷
                </span>
                <span className="quick-action__copy">
                  <strong>Mes rendez-vous</strong>
                  <small>Retrouver tes réservations</small>
                </span>
              </Link>
            </MotionSurface>
            <MotionSurface className="quick-action-motion">
              <Link className="quick-action" href="/shops">
                <span aria-hidden="true" className="quick-action__icon">
                  ↗
                </span>
                <span className="quick-action__copy">
                  <strong>Découvrir les boutiques</strong>
                  <small>Parcourir l’annuaire</small>
                </span>
              </Link>
            </MotionSurface>
          </nav>
        </section>

        <section
          aria-label="Résumé du compte"
          className="account-stats"
          data-stagger="account-stats"
          data-stagger-target=".stat-card"
        >
          <MotionSurface className="account-stat-motion">
            <article className="stat-card">
              <span aria-hidden="true" className="stat-card__icon">
                01
              </span>
              <p className="stat-card__value">{totalOrders}</p>
              <p className="stat-card__label">
                Commande{totalOrders > 1 ? "s" : ""}
              </p>
            </article>
          </MotionSurface>
          <MotionSurface className="account-stat-motion">
            <article className="stat-card">
              <span aria-hidden="true" className="stat-card__icon">
                02
              </span>
              <p className="stat-card__value">{completedOrders.length}</p>
              <p className="stat-card__label">Terminées sur cette page</p>
            </article>
          </MotionSurface>
          <MotionSurface className="account-stat-motion">
            <article className="stat-card">
              <span aria-hidden="true" className="stat-card__icon">
                FCFA
              </span>
              <p className="stat-card__value">
                {totalSpent.toLocaleString("fr-FR")}
              </p>
              <p className="stat-card__label">Dépensé sur cette page</p>
            </article>
          </MotionSurface>
        </section>

        <section
          aria-label="Mes commandes"
          className="account-section"
          data-reveal
        >
          <CustomerOrders
            currentPage={currentPage}
            orders={orders}
            shops={shopSummaries}
            totalCount={totalOrders}
            userId={user.id}
          />
        </section>

        <section
          aria-label="Mes notifications"
          className="account-section"
          data-reveal
        >
          <NotificationCenter userId={user.id} />
        </section>

        <section
          id="account-profile"
          aria-labelledby="account-profile-title"
          className="account-section account-profile-section"
          data-reveal
        >
          <div className="account-section__heading">
            <div>
              <p className="account-section__eyebrow">Tes informations</p>
              <h2 id="account-profile-title">Profil et sécurité</h2>
            </div>
            <p className="account-section__description">
              Mets à jour les informations utilisées pour tes commandes et tes
              rendez-vous.
            </p>
          </div>
          <MotionSurface className="account-profile-motion">
            <div className="account-profile-card">
              <ProfileForm
                avatarUrl={profile.avatar_url}
                fullName={profile.full_name ?? ""}
                phone={profile.phone ?? ""}
                reauthVerified={reauthVerified}
              />
            </div>
          </MotionSurface>
        </section>

        <footer className="account-footer" data-reveal>
          <p>Ton compte Faso Studio</p>
          <SignOutButton />
        </footer>
      </div>
    </main>
  );
}
