import Link from "next/link";
import { CouponWorkspace } from "@/features/promotions/coupon-workspace";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";

type Props = { searchParams: Promise<{ shop?: string }> };

function hasPromotionsFeature(features: Json) {
  return (
    typeof features === "object" &&
    features !== null &&
    !Array.isArray(features) &&
    features.promotions === true
  );
}

export default async function PromotionsPage({ searchParams }: Props) {
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

  const shopIds = (memberships ?? [])
    .filter((member) => {
      const permissions =
        typeof member.permissions === "object" &&
        member.permissions !== null &&
        !Array.isArray(member.permissions)
          ? member.permissions
          : {};
      return member.role === "owner" || permissions.promotions === true;
    })
    .map((member) => member.shop_id);
  if (!shopIds.length) {
    return (
      <section className="team-section">
        <h1>Promotions</h1>
        <p>Tu n’as pas de boutique avec le droit de gérer les promotions.</p>
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
  const shop =
    availableShops.find((item) => item.id === params.shop) ?? availableShops[0];
  if (!shop) throw new Error("La boutique sélectionnée est introuvable.");

  const [
    { data: subscription, error: subscriptionError },
    { data: products, error: productsError },
    { data: categories, error: categoriesError },
  ] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("plan_id, status")
      .eq("shop_id", shop.id)
      .maybeSingle(),
    supabase
      .from("products")
      .select("id, name")
      .eq("shop_id", shop.id)
      .eq("is_sample", false)
      .is("deleted_at", null)
      .order("name")
      .limit(200),
    supabase
      .from("categories")
      .select("id, name")
      .eq("shop_id", shop.id)
      .order("name")
      .limit(200),
  ]);
  if (subscriptionError || productsError || categoriesError) {
    throw new Error("Impossible de charger les réglages de promotion.", {
      cause: subscriptionError ?? productsError ?? categoriesError,
    });
  }

  const { data: plan, error: planError } =
    subscription?.status !== "expired" && subscription?.plan_id
      ? await supabase
          .from("plans")
          .select("features")
          .eq("id", subscription.plan_id)
          .maybeSingle()
      : await supabase
          .from("plans")
          .select("features")
          .eq("code", "free")
          .maybeSingle();
  if (planError || !plan) {
    throw new Error("Impossible de vérifier les options du plan.", {
      cause: planError,
    });
  }
  if (!hasPromotionsFeature(plan.features)) {
    return (
      <section className="team-section">
        <h1>Promotions</h1>
        <p>La création de promotions est réservée au plan Pro.</p>
        <Link
          className="ui-button ui-button--primary"
          href={`/dashboard/abonnement?shop=${encodeURIComponent(shop.id)}`}
        >
          Découvrir le plan Pro
        </Link>
      </section>
    );
  }

  const { data: coupons, error: couponsError } = await supabase
    .from("coupons")
    .select("*")
    .eq("shop_id", shop.id)
    .order("created_at", { ascending: false });
  if (couponsError) {
    throw new Error("Impossible de charger les promotions.", {
      cause: couponsError,
    });
  }

  return (
    <main className="dashboard-page">
      <header className="dashboard-page__header">
        <p className="auth-eyebrow">{shop.name}</p>
        <h1>Promotions et codes promo</h1>
        <p>
          Choisis les produits ou catégories concernés. Sans ciblage, le code
          s’applique à tous les produits admissibles.
        </p>
      </header>
      {availableShops.length > 1 ? (
        <nav
          aria-label="Choisir une boutique"
          className="dashboard-shop-switcher"
        >
          {availableShops.map((item) => (
            <Link
              aria-current={item.id === shop.id ? "page" : undefined}
              href={`/dashboard/promotions?shop=${encodeURIComponent(item.id)}`}
              key={item.id}
            >
              {item.name}
            </Link>
          ))}
        </nav>
      ) : null}
      <CouponWorkspace
        categories={categories ?? []}
        coupons={coupons ?? []}
        products={products ?? []}
        shopId={shop.id}
      />
    </main>
  );
}
