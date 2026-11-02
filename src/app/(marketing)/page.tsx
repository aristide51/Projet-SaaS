import Link from "next/link";
import type { Metadata } from "next";
import { MarketingHeader } from "@/components/design/marketing-header";
import { MarketingHeroCarousel } from "@/components/design/marketing-hero-carousel";
import { MarketingMotion } from "@/components/design/marketing-motion";
import { PricingOfferCards } from "@/components/design/pricing-offer-cards";
import { MotionSurface } from "@/components/design/motion-surface";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/env";
import type { Json } from "@/types/database";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  title: "Faso Studio — Votre commerce local, prêt pour le numérique",
  description:
    "Créez une boutique en ligne, gérez les commandes et les rendez-vous, et encaissez par mobile money avec un outil pensé pour les commerces du Burkina Faso.",
  robots: { index: true, follow: true },
};

const steps = [
  {
    number: "01",
    title: "Créez votre boutique",
    description: "Présentez votre activité.",
  },
  {
    number: "02",
    title: "Ajoutez vos offres",
    description: "Produits, services ou rendez-vous.",
  },
  {
    number: "03",
    title: "Recevez vos clients",
    description: "Commandes et réservations, réunies.",
  },
];

const faqs = [
  {
    question: "Faut-il savoir créer un site web ?",
    answer: "Non. Créez votre boutique sans écrire de code.",
  },
  {
    question: "Quels appareils et quelle connexion ?",
    answer: "Android 13 ou iOS 16+, avec une connexion 4G ou Wi-Fi stable.",
  },
  {
    question: "Comment se passe un paiement ?",
    answer:
      "Le client déclare son paiement Mobile Money, puis vous le confirmez.",
  },
];

function getPlanFeatures(value: Json): string[] {
  if (Array.isArray(value)) {
    return value.filter(
      (feature): feature is string => typeof feature === "string",
    );
  }

  if (value === null || typeof value !== "object") {
    return [];
  }

  const labels: Record<string, string> = {
    bookings: "Rendez-vous en ligne",
    promotions: "Promotions",
    analytics: "Statistiques de vente",
    priority_support: "Support prioritaire",
  };

  return Object.entries(value).flatMap(([feature, enabled]) =>
    enabled === true && labels[feature] ? [labels[feature]] : [],
  );
}

function getPlanProductLimit(value: Json): number | null | undefined {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const limit = value.max_products;
  return typeof limit === "number" || limit === null ? limit : undefined;
}

export default async function HomePage() {
  const isSupabaseConfigured = hasSupabaseConfig();
  const supabase = isSupabaseConfigured ? await createClient() : null;
  const { data: plans, error } = supabase
    ? await supabase
        .from("plans")
        .select("code, name, price_monthly, limits, features")
        .eq("active", true)
        .order("sort_order")
    : { data: null, error: null };

  const money = new Intl.NumberFormat("fr-FR");

  return (
    <main id="contenu" className="marketing-home">
      <a className="marketing-skip-link" href="#hero-title">
        Aller au contenu principal
      </a>
      <MarketingHeader currentPath="/" />

      <MarketingMotion>
        <MarketingHeroCarousel />

        <section
          aria-labelledby="benefits-title"
          className="marketing-section marketing-benefits"
          id="solutions"
        >
          <div className="marketing-section__heading" data-reveal>
            <h2 id="benefits-title">
              Gérez tout
              <br />
              <span>au même endroit.</span>
            </h2>
          </div>
          <div className="benefit-grid" data-stagger="benefits">
            <MotionSurface className="benefit-card-motion">
              <article className="benefit-card" id="vitrine">
                <p className="benefit-card__number">
                  <span>01</span>
                </p>
                <h3>Votre vitrine</h3>
                <p>Présentez vos produits et services.</p>
                <a href="#fonctionnement">
                  Voir la vitrine <span aria-hidden="true">→</span>
                </a>
              </article>
            </MotionSurface>
            <MotionSurface className="benefit-card-motion">
              <article className="benefit-card" id="rendez-vous">
                <p className="benefit-card__number">
                  <span>02</span>
                </p>
                <h3>Vos rendez-vous</h3>
                <p>Laissez vos clients réserver en ligne.</p>
                <a href="#fonctionnement">
                  Voir l’agenda <span aria-hidden="true">→</span>
                </a>
              </article>
            </MotionSurface>
            <MotionSurface className="benefit-card-motion">
              <article className="benefit-card" id="commandes">
                <p className="benefit-card__number">
                  <span>03</span>
                </p>
                <h3>Vos commandes</h3>
                <p>Gardez le fil de chaque demande.</p>
                <a href="#offres">
                  Voir les offres <span aria-hidden="true">→</span>
                </a>
              </article>
            </MotionSurface>
          </div>
        </section>

        <section
          aria-labelledby="steps-title"
          className="marketing-steps"
          id="fonctionnement"
        >
          <div className="marketing-steps__intro" data-reveal>
            <h2 id="steps-title">En trois étapes.</h2>
            <Link
              className="marketing-button marketing-button--light"
              href="/auth/signup"
            >
              Commencer gratuitement <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="step-sequence" data-step-sequence>
            <div aria-hidden="true" className="step-sequence__track">
              <span data-step-progress />
            </div>
            <ol className="step-list" data-stagger>
              {steps.map((step) => (
                <li key={step.number}>
                  <span className="step-list__number">{step.number}</span>
                  <div>
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </div>
                  <span aria-hidden="true" className="step-list__arrow">
                    ↗
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section
          aria-labelledby="plans-title"
          className="marketing-section marketing-plans"
          id="offres"
        >
          <div className="marketing-section__heading" data-reveal>
            <h2 id="plans-title">Des offres simples.</h2>
          </div>
          {!isSupabaseConfigured ? (
            <p className="plan-note" role="status">
              Les offres détaillées ne sont pas chargées dans cet aperçu. Le
              reste de la vitrine reste consultable.
            </p>
          ) : error ? (
            <p className="plan-note" role="alert">
              Les offres ne sont pas disponibles pour le moment. Vous pouvez
              tout de même créer votre boutique gratuitement.
              <br />
              <Link href="/auth/signup">Commencer maintenant</Link>
            </p>
          ) : (
            <PricingOfferCards
              offers={(plans ?? []).map((plan) => {
                const isPro = plan.code === "pro";
                const productLimit = getPlanProductLimit(plan.limits);
                const features = getPlanFeatures(plan.features);

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
          {isSupabaseConfigured && !error && (
            <p className="plan-note">
              Une question sur les offres ?{" "}
              <Link href="/auth/signup">Notre équipe peut vous orienter.</Link>
            </p>
          )}
        </section>

        <section aria-labelledby="trust-title" className="marketing-trust">
          <div data-reveal>
            <h2 id="trust-title">
              Simple sur <span>mobile.</span>
            </h2>
          </div>
          <div className="trust-points" data-stagger>
            <article>
              <span aria-hidden="true">◎</span>
              <div>
                <h3>Simple à utiliser</h3>
              </div>
            </article>
            <article>
              <span aria-hidden="true">⌁</span>
              <div>
                <h3>Mobile Money</h3>
              </div>
            </article>
            <article>
              <span aria-hidden="true">◇</span>
              <div>
                <h3>Vos données restent les vôtres.</h3>
              </div>
            </article>
          </div>
        </section>

        <section
          aria-labelledby="faq-title"
          className="marketing-section marketing-faq"
        >
          <div className="marketing-section__heading" data-reveal>
            <h2 id="faq-title">Questions fréquentes.</h2>
          </div>
          <div className="faq-list" data-stagger>
            {faqs.map((faq) => (
              <details key={faq.question}>
                <summary>
                  {faq.question}
                  <span aria-hidden="true">＋</span>
                </summary>
                <p>{faq.answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="marketing-final-cta">
          <div data-reveal>
            <h2>Prêt à vous lancer ?</h2>
            <div className="marketing-hero__actions">
              <Link className="marketing-button" href="/auth/signup">
                Créer ma boutique <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </section>
      </MarketingMotion>

      <footer className="marketing-footer">
        <div className="marketing-footer__main">
          <div className="marketing-footer__brand">
            <Link className="marketing-brand" href="/">
              <span aria-hidden="true" className="marketing-brand__mark">
                F
              </span>
              <span>Faso Studio</span>
            </Link>
            <p>Des commerces d’ici, visibles partout.</p>
          </div>
          <nav
            aria-label="Explorer Faso Studio"
            className="marketing-footer__nav"
          >
            <span className="marketing-footer__label">Explorer</span>
            <Link href="#solutions">Solutions</Link>
            <Link href="#fonctionnement">Comment ça marche</Link>
            <Link href="#offres">Tarifs</Link>
            <Link href="/shops">Annuaire</Link>
          </nav>
          <div className="marketing-footer__account">
            <span className="marketing-footer__label">Votre espace</span>
            <Link className="marketing-footer__login" href="/auth/login">
              Connexion
            </Link>
            <Link
              className="marketing-button marketing-button--small"
              href="/auth/signup"
            >
              Créer ma boutique <span aria-hidden="true">→</span>
            </Link>
          </div>
        </div>
        <div className="marketing-footer__bottom">
          <small>© {new Date().getFullYear()} Faso Studio</small>
          <span>Le numérique au service des commerces du Burkina.</span>
        </div>
      </footer>
    </main>
  );
}
