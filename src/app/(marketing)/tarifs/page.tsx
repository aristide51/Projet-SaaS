import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
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
    <main className="min-h-screen bg-[#fcf6f0] text-[#1b261f]">
      <section className="border-b border-[#e7ddd4] bg-white px-4 py-16 md:py-24">
        <div className="mx-auto max-w-5xl text-center">
          <p className="marketing-kicker justify-center">
            Tarifs et abonnements
          </p>
          <h1 className="mt-4 font-[Manrope] text-4xl font-extrabold tracking-tight md:text-6xl">
            Des abonnements simples,
            <br />
            sans surprise.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-[#59645d]">
            Choisissez le plan adapté à votre commerce. Les prix sont affichés
            en FCFA par mois.
          </p>
        </div>
      </section>

      <section aria-label="Offres disponibles" className="px-4 py-16 md:py-20">
        <div className="mx-auto max-w-6xl">
          {error ? (
            <p
              className="rounded-lg border border-[#e7ddd4] bg-white p-6 text-center text-[#59645d]"
              role="alert"
            >
              Les tarifs sont temporairement indisponibles. Vérifiez que
              Supabase local est démarré, puis actualisez la page.
            </p>
          ) : plans.length === 0 ? (
            <p className="rounded-lg border border-[#e7ddd4] bg-white p-6 text-center text-[#59645d]">
              Aucune offre n’est disponible pour le moment.
            </p>
          ) : (
            <div className="grid gap-6 md:grid-cols-3">
              {plans.map((plan) => {
                const isPopular = plan.code === "pro";
                const productLimit = getProductLimit(plan.limits);
                const features = getEnabledFeatures(plan.features);
                const allFeatures = [
                  typeof productLimit === "number"
                    ? `Jusqu’à ${productLimit} produits`
                    : productLimit === null
                      ? "Produits illimités"
                      : null,
                  "Commandes en ligne",
                  "Vitrine publique de la boutique",
                  ...features,
                ].filter((feature): feature is string => Boolean(feature));

                return (
                  <article
                    className={`relative flex flex-col rounded-2xl border bg-white p-7 shadow-sm transition duration-200 hover:-translate-y-1 hover:shadow-lg ${
                      isPopular
                        ? "border-[#066624] ring-2 ring-[#066624]"
                        : "border-[#e7ddd4]"
                    }`}
                    key={plan.code}
                  >
                    {isPopular && (
                      <p className="mb-3 w-fit rounded-full bg-[#0a2a18] px-3 py-1 text-xs font-bold text-white">
                        Le plus populaire
                      </p>
                    )}
                    <h2 className="font-[Manrope] text-xl font-bold">
                      {plan.name}
                    </h2>
                    <p className="mt-4 flex flex-wrap items-baseline gap-2">
                      <strong className="text-4xl font-extrabold">
                        {plan.price_monthly === 0
                          ? "Gratuit"
                          : money.format(plan.price_monthly)}
                      </strong>
                      {plan.price_monthly > 0 && (
                        <span className="text-sm text-[#59645d]">
                          FCFA / mois
                        </span>
                      )}
                    </p>
                    <ul className="my-7 flex-1 space-y-3 text-sm text-[#59645d]">
                      {allFeatures.map((feature) => (
                        <li className="flex gap-2" key={feature}>
                          <span aria-hidden="true" className="text-[#066624]">
                            ✓
                          </span>
                          {feature}
                        </li>
                      ))}
                    </ul>
                    <Link
                      className={`inline-flex min-h-12 items-center justify-center rounded-lg px-5 py-3 text-center font-bold transition ${
                        isPopular
                          ? "bg-[#cc0018] text-white hover:bg-[#a90014]"
                          : "border border-[#cc0018] text-[#a90014] hover:bg-[#fff0ef]"
                      }`}
                      href="/auth/signup"
                    >
                      {plan.price_monthly === 0
                        ? "Créer ma boutique"
                        : "Choisir cette offre"}
                      <span aria-hidden="true" className="ml-2">
                        →
                      </span>
                    </Link>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <section className="bg-[#0a2a18] px-4 py-16 text-center text-white">
        <div className="mx-auto max-w-3xl">
          <h2 className="font-[Manrope] text-3xl font-bold">
            Une question sur les offres ?
          </h2>
          <p className="mt-4 text-white/80">
            Nous pouvons vous aider à choisir la formule adaptée à votre
            activité.
          </p>
          <Link
            className="mt-7 inline-flex min-h-12 items-center justify-center rounded-lg bg-[#cc0018] px-6 py-3 font-bold text-white hover:bg-[#a90014]"
            href="/auth/signup"
          >
            Contacter l’équipe
          </Link>
        </div>
      </section>
    </main>
  );
}
