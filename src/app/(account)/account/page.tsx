import Link from "next/link";
import { getUser } from "@/lib/supabase/server";
import { SignOutButton } from "@/features/auth/sign-out-button";
import { ProfileForm } from "@/features/profile/profile-form";
import { createClient } from "@/lib/supabase/server";
import { hasRecentReauthentication } from "@/lib/security/reauth";
import { NotificationCenter } from "@/features/notifications/notification-center";
import { CustomerOrders } from "@/features/orders/customer-orders";
import { redirect } from "next/navigation";
import { CUSTOMER_ORDER_PAGE_SIZE } from "@/features/orders/types";

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
  const { data: profile, error } = await supabase
    .from("profiles")
    .select("full_name, phone, avatar_url")
    .eq("id", user.id)
    .single();

  if (error) {
    throw new Error("Impossible de charger le profil.", { cause: error });
  }

  const [
    { data: orders, error: ordersError, count: ordersCount },
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

  const shopIds = [...new Set((orders ?? []).map((order) => order.shop_id))];
  const orderIds = (orders ?? []).map((order) => order.id);
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
  const completedOrderIds = (orders ?? [])
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

  return (
    <main className="auth-main">
      <section className="auth-card profile-card">
        <p className="auth-eyebrow">Mon compte</p>
        <h1>Mon profil</h1>
        <p className="auth-description">Connecté avec {user.email}</p>
        <NotificationCenter userId={user.id} />
        <Link
          className="ui-button ui-button--secondary"
          href="/account/bookings"
        >
          Mes rendez-vous
        </Link>
        <ProfileForm
          avatarUrl={profile.avatar_url}
          fullName={profile.full_name ?? ""}
          phone={profile.phone ?? ""}
          reauthVerified={reauthVerified}
        />
        <SignOutButton />
        <CustomerOrders
          orders={(orders ?? []).map((order) => ({
            ...order,
            items: order.order_items ?? [],
            history: order.order_status_history ?? [],
            cancellationRequest: latestRequestByOrder.get(order.id) ?? null,
            reviewed: reviewedOrderIds.has(order.id),
          }))}
          currentPage={currentPage}
          totalCount={totalOrders}
          shops={shops ?? []}
          userId={user.id}
        />
      </section>
    </main>
  );
}
