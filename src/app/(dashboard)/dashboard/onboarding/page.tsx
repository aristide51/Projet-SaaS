import Link from "next/link";
import { OnboardingStarter } from "@/features/onboarding/onboarding-starter";
import { OnboardingWizard } from "@/features/onboarding/onboarding-wizard";
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
    .select("id, name, slug, created_at, review_status")
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
          <h1>Ta boutique est déjà publiée</h1>
          <p>
            Cette boutique a terminé sa mise en route. Tu peux revenir au
            tableau de bord.
          </p>
          <Link className="ui-button ui-button--primary" href="/dashboard">
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
      shopId={shop.id}
      shopName={shop.name === "Nouvelle boutique" ? "Ta boutique" : shop.name}
    />
  );
}
