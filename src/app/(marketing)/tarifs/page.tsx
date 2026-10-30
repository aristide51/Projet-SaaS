import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { MarketingSecondaryNav } from "@/components/marketing-secondary-nav";
import { PricingOfferCards } from "@/components/design/pricing-offer-cards";
import type { Json } from "@/types/database";

export const metadata: Metadata = {
  alternates: { canonical: "/tarifs" },
  title: "Tarifs - Faso Studio",
  description:
    "Des abonnements simples et transparents pour les commerces locaux du Burkina Faso.",
  robots: { index: true, follow: true },
};

const featureLabels: Record<string, string> = {
  bookings: "Rendez-vous et créneaux en ligne",
  promotions: "Promotions",
  analytics: "Statistiques de vente",
  priority_support: "Support prioritaire",
};

function getEnabledFeatures(value: Json): string[] {
  if (Array.isArray(value)) {
    return value.filter(
      (feature): feature is string => typeof feature === "string",
    );
  }

  if (value === null || typeof value !== "object") {
    return [];
  }

  return Object.entries(value)
    .filter(([key, enabled]) => enabled === true && featureLabels[key])
    .map(([key]) => featureLabels[key])
    .filter((feature): feature is string => Boolean(feature));
}

function getProductLimit(value: Json): number | null | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const limit = value.max_products;
  return typeof limit === "number" || limit === null ? limit : undefined;
}

export default async function TarifsPage() {
  const supabase = await createClient();
  const { data: plans, error } = await supabase
    .from("plans")
    .select("code, name, price_monthly, limits, features")
    .eq("active", true)
    .order("sort_order");
  const money = new Intl.NumberFormat("fr-FR");

  return (
    <main className="pricing-page min-h-screen">
      <MarketingSecondaryNav currentPath="/tarifs" />
      <section className="border-b px-4 py-16 md:py-24">
        <div className="mx-auto max-w-5xl text-center">
          <p className="marketing-kicker justify-center">
            Tarifs et abonnements
          </p>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight md:text-6xl">
            Des abonnements simples,
            <br />
            sans surprise.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed">
            Choisissez le plan adapté à votre commerce. Les prix sont affichés
            en FCFA par mois.
          </p>
        </div>
      </section>

      <section aria-label="Offres disponibles" className="px-4 py-16 md:py-20">
        <div className="mx-auto max-w-6xl">
          {error ? (
            <p className="pricing-page__message" role="alert">
              Les tarifs sont temporairement indisponibles. Vérifiez que
              Supabase local est démarré, puis actualisez la page.
            </p>
          ) : (plans ?? []).length === 0 ? (
            <p className="pricing-page__message">
              Aucune offre n’est disponible pour le moment.
            </p>
          ) : (
            <PricingOfferCards
              offers={(plans ?? []).map((plan) => {
                const isPro = plan.code === "pro";
                const productLimit = getProductLimit(plan.limits);
                const features = getEnabledFeatures(plan.features);

                return {
                  code: plan.code,
                  name: plan.name,
                  formattedPrice: money.format(plan.price_monthly),
                  isFree: plan.price_monthly === 0,
                  description:
                    plan.code === "free"
                      ? "Pour lancer votre première vitrine."
                      : isPro
                        ? "Pour développer vos ventes et vos services."
                        : "Pour structurer votre activité.",
                  benefits: [
                    typeof productLimit === "number"
                      ? `Jusqu’à ${productLimit} produits`
                      : productLimit === null
                        ? "Produits illimités"
                        : "Catalogue de produits",
                    "Commandes en ligne",
                    "Partage de votre boutique",
                    ...features,
                  ],
                  cta:
                    plan.price_monthly === 0
                      ? "Créer ma boutique"
                      : "Choisir cette offre",
                  featured: isPro,
                };
              })}
            />
          )}
        </div>
      </section>

      <section className="px-4 py-16 text-center">
        <div className="mx-auto max-w-3xl">
          <h2 className="text-3xl font-bold">Une question sur les offres ?</h2>
          <p className="mt-4">
            Nous pouvons vous aider à choisir la formule adaptée à votre
            activité.
          </p>
          <Link
            className="mt-7 inline-flex min-h-12 items-center justify-center px-6 py-3 font-bold"
            href="/auth/signup"
          >
            Contacter l’équipe
          </Link>
        </div>
      </section>
    </main>
  );
}
