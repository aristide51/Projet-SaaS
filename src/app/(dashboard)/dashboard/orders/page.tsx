import Link from "next/link";
import { OrdersWorkspace } from "@/features/orders/orders-workspace";
import { getOrders } from "@/features/orders/actions";
import { logError } from "@/lib/monitoring/sentry";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { orderStatusSchema } from "@/features/orders/schemas";

type OrdersPageProps = {
  searchParams: Promise<{
    shop?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
  }>;
};

function parseDateParam(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
    ? undefined
    : value;
}

export default async function OrdersPage({ searchParams }: OrdersPageProps) {
  const user = await requireVerifiedUser();
  const params = await searchParams;
  const supabase = await createClient();
  const { data: memberships, error: membershipError } = await supabase
    .from("shop_members")
    .select("shop_id, role, permissions")
    .eq("user_id", user.id);

  if (membershipError) {
    throw new Error("Impossible de charger tes boutiques.", {
      cause: membershipError,
    });
  }

  const orderMemberships = (memberships ?? []).filter((member) => {
    const permissions =
      typeof member.permissions === "object" &&
      member.permissions !== null &&
      !Array.isArray(member.permissions)
        ? member.permissions
        : {};
    return member.role === "owner" || permissions.orders === true;
  });

  if (!orderMemberships.length) {
    return (
      <main className="orders-shell">
        <section className="orders-panel" role="alert">
          <h1>Accès refusé</h1>
          <p>
            Tu n’as pas de boutique avec la permission « commandes ». Demande au
            propriétaire de t’accorder ce droit.
          </p>
        </section>
      </main>
    );
  }

  const shopIds = orderMemberships.map((membership) => membership.shop_id);
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

  if (!shops?.length) {
    return (
      <main className="orders-shell">
        <section className="orders-panel">
          <h1>Commandes</h1>
          <p>Crée une boutique pour commencer à recevoir des commandes.</p>
          <Link
            className="ui-button ui-button--primary"
            href="/dashboard/onboarding"
          >
            Créer ma boutique
          </Link>
        </section>
      </main>
    );
  }

  const shop = params.shop
    ? shops.find((item) => item.id === params.shop)
    : shops[0];

  if (!shop || !shopIds.includes(shop.id)) {
    return (
      <main className="orders-shell">
        <section className="orders-panel" role="alert">
          <h1>Boutique introuvable</h1>
          <p>Tu n’as pas accès à cette boutique.</p>
        </section>
      </main>
    );
  }

  const statusResult = orderStatusSchema.safeParse(params.status);
  const status = statusResult.success ? statusResult.data : undefined;
  const dateFrom = parseDateParam(params.dateFrom);
  const dateTo = parseDateParam(params.dateTo);
  const ordersResult = await getOrders(shop.id, {
    ...(status ? { status } : {}),
    ...(dateFrom ? { dateFrom: `${dateFrom}T00:00:00.000Z` } : {}),
    ...(dateTo ? { dateTo: `${dateTo}T23:59:59.999Z` } : {}),
  });

  if (!ordersResult.success) {
    return (
      <main className="orders-shell">
        <section className="orders-panel" role="alert">
          <h1>Commandes indisponibles</h1>
          <p>{ordersResult.message}</p>
        </section>
      </main>
    );
  }

  const orders = await Promise.all(
    ordersResult.orders.map(async (order) => {
      const path = order.declaration?.screenshot_path;
      if (!path) return { ...order, proofUrl: null };

      if (!path.startsWith(`${shop.id}/${order.id}/`)) {
        await logError(
          "orders_payment_proof_path_invalid",
          new Error("Payment proof path did not match its shop and order."),
        );
        return { ...order, proofUrl: null };
      }

      const { data, error } = await supabase.storage
        .from("payment-proofs")
        .createSignedUrl(path, 300);
      if (error) {
        await logError("orders_payment_proof_signed_url_failed", error);
      }
      return { ...order, proofUrl: data?.signedUrl ?? null };
    }),
  );

  return (
    <OrdersWorkspace
      orders={orders}
      dateFrom={dateFrom ?? ""}
      dateTo={dateTo ?? ""}
      selectedStatus={status ?? ""}
      shopId={shop.id}
      shops={shops}
    />
  );
}
