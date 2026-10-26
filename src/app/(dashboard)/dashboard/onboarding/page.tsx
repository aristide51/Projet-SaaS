import Link from "next/link";
import { OnboardingStarter } from "@/features/onboarding/onboarding-starter";
import { OnboardingWizard } from "@/features/onboarding/onboarding-wizard";
import { ShopSharePanel } from "@/features/onboarding/shop-share-panel";
import {
  createDefaultDraft,
  onboardingDraftSchema,
} from "@/features/onboarding/schemas";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

type OnboardingPageProps = {
  searchParams: Promise<{ shop?: string }>;
};

export default async function ShopOnboardingPage({
  searchParams,
}: OnboardingPageProps) {
  const user = await requireVerifiedUser();
  const { shop: requestedShopId } = await searchParams;
  const supabase = await createClient();
  let shopsQuery = supabase
    .from("shops")
    .select(
      "id, name, slug, created_at, review_status, submitted_at, rejection_reason",
    )
    .eq("created_by", user.id)
    .order("created_at", { ascending: false });

  if (requestedShopId) {
    shopsQuery = shopsQuery.eq("id", requestedShopId);
  }

  const { data: shops, error: shopsError } = await shopsQuery;

  if (shopsError) {
    throw new Error("Impossible de charger tes boutiques.", {
      cause: shopsError,
    });
  }

  const shop =
    shops?.find((candidate) => candidate.review_status !== "approved") ??
    shops?.[0];

  if (!shop) {
    return <OnboardingStarter />;
  }

  if (shop.review_status === "approved") {
    return (
      <main className="onboarding-shell">
        <section className="onboarding-card">
          <p className="auth-eyebrow">Espace commerçant</p>
          <h1>Ta boutique est publiée !</h1>
          <ShopSharePanel shopName={shop.name} slug={shop.slug} />
          <Link className="ui-button ui-button--primary" href="/dashboard">
            Retour au tableau de bord
          </Link>
        </section>
      </main>
    );
  }

  if (shop.review_status === "submitted") {
    return (
      <main className="onboarding-shell">
        <section className="onboarding-card">
          <p className="auth-eyebrow">Validation de la boutique</p>
          <h1>Ta boutique est en attente de validation</h1>
          <p>
            Un administrateur examine ta demande. La réponse est prévue sous
            24 heures. En attendant, ta vitrine reste privée.
          </p>
          {shop.submitted_at ? (
            <p>
              Demande envoyée le{" "}
              {new Date(shop.submitted_at).toLocaleString("fr-FR", {
                dateStyle: "long",
                timeStyle: "short",
                timeZone: "Africa/Ouagadougou",
              })}
              .
            </p>
          ) : null}
          <Link
            className="ui-button ui-button--secondary"
            href={`/dashboard/onboarding/preview?shop=${encodeURIComponent(shop.id)}`}
          >
            Consulter l’aperçu privé
          </Link>
          <Link className="ui-button ui-button--secondary" href="/dashboard">
            Retour au tableau de bord
          </Link>
        </section>
      </main>
    );
  }

  const { data: onboarding, error: onboardingError } = await supabase
    .from("shop_onboarding")
    .select("current_step, draft, updated_at")
    .eq("shop_id", shop.id)
    .maybeSingle();

  if (onboardingError || !onboarding) {
    throw new Error("Impossible de charger le brouillon de la boutique.", {
      cause: onboardingError ?? undefined,
    });
  }

  const [products, services, paymentMethods] = await Promise.all([
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shop.id)
      .eq("is_sample", false)
      .is("deleted_at", null),
    supabase
      .from("services")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", shop.id)
      .eq("is_sample", false)
      .is("deleted_at", null),
    supabase
      .from("shop_payment_methods")
      .select("type, phone_or_code, ussd_template, active")
      .eq("shop_id", shop.id)
      .in("type", [
        "ussd_orange",
        "ussd_moov",
        "cash_on_delivery",
        "pay_at_pickup",
      ]),
  ]);
  const dataError = products.error ?? services.error ?? paymentMethods.error;
  if (dataError) {
    throw new Error("Impossible de charger les étapes de ta boutique.", {
      cause: dataError,
    });
  }

  const fallbackDraft = {
    ...createDefaultDraft(shop.slug),
    name: shop.name === "Nouvelle boutique" ? "" : shop.name,
  };
  const parsedDraft = onboardingDraftSchema.safeParse(onboarding.draft);

  return (
    <OnboardingWizard
      currentStep={onboarding.current_step}
      draft={parsedDraft.success ? parsedDraft.data : fallbackDraft}
      serverUpdatedAt={Date.parse(onboarding.updated_at)}
      catalogCount={(products.count ?? 0) + (services.count ?? 0)}
      paymentMethods={paymentMethods.data ?? []}
      shopId={shop.id}
      shopName={shop.name === "Nouvelle boutique" ? "Ta boutique" : shop.name}
      rejectionReason={shop.rejection_reason}
    />
  );
}
