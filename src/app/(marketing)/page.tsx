import Link from "next/link";
import type { Metadata } from "next";
import { BusinessPreview } from "@/components/design/business-preview";
import { MarketingMotion } from "@/components/design/marketing-motion";
import { MotionSurface } from "@/components/design/motion-surface";
import { PlatformScene } from "@/components/design/platform-scene";
import { createClient } from "@/lib/supabase/server";
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
    title: "Ajoutez votre offre",
    description: "Ajoutez vos produits ou services.",
  },
  {
    number: "03",
    title: "Recevez vos clients",
    description: "Suivez commandes et rendez-vous.",
  },
];

const faqs = [
  {
    question: "Faut-il savoir créer un site web ?",
    answer: "Non, créez votre boutique sans écrire de code.",
  },
  {
    question: "Quels appareils et quelle connexion sont nécessaires ?",
    answer:
      "Un téléphone récent (Android 13 ou plus récent, iPhone sous iOS 16 ou plus récent) et une connexion 4G stable ou un Wi-Fi rapide. Une vérification automatique contrôle les capacités disponibles.",
  },
  {
    question: "Comment les clients peuvent-ils payer ?",
    answer:
      "Les paiements Mobile Money sont déclarés par le client puis vérifiés par le commerçant.",
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
  const supabase = await createClient();
  const { data: plans, error } = await supabase
    .from("plans")
    .select("code, name, price_monthly, limits, features")
    .eq("active", true)
    .order("sort_order");

  const money = new Intl.NumberFormat("fr-FR");

  return (
    <main id="contenu" className="marketing-home">
      <a className="marketing-skip-link" href="#hero-title">
        Aller au contenu principal
      </a>
      <header className="marketing-header">
        <div className="marketing-utility-bar">
          <p>Le numérique au rythme des commerces du Burkina Faso</p>
        </div>
        <div className="marketing-header__main">
          <Link className="marketing-brand" href="/">
            <span aria-hidden="true" className="marketing-brand__mark">
              F
            </span>
            <span>Faso Studio</span>
          </Link>
          <nav aria-label="Navigation principale" className="marketing-nav">
            <div className="marketing-nav__menu">
              <a className="marketing-nav__trigger" href="#solutions">
                Solutions
              </a>
              <div className="marketing-nav__panel">
                <a href="#vitrine">
                  <strong>Vitrine</strong>
                  <span>Produits et services</span>
                </a>
                <a href="#commandes">
                  <strong>Commandes</strong>
                  <span>Suivi des demandes</span>
                </a>
                <a href="#rendez-vous">
                  <strong>Rendez-vous</strong>
                  <span>Créneaux en ligne</span>
                </a>
              </div>
            </div>
            <a href="#fonctionnement">Comment ça marche</a>
            <a href="#offres">Tarifs</a>
            <Link href="/shops">Annuaire</Link>
          </nav>
          <div className="marketing-header__actions">
            <Link className="marketing-login" href="/auth/login">
              Connexion
            </Link>
            <Link
              className="marketing-button marketing-button--small"
              href="/auth/signup"
            >
              Créer ma boutique
            </Link>
          </div>
          <details className="marketing-mobile-menu">
            <summary aria-label="Ouvrir le menu de navigation">
              <span aria-hidden="true" />
              <span aria-hidden="true" />
              <span className="marketing-mobile-menu__label">Menu</span>
            </summary>
            <nav aria-label="Navigation mobile">
              <a href="#solutions">Solutions</a>
              <a href="#fonctionnement">Comment ça marche</a>
              <a href="#offres">Tarifs</a>
              <Link href="/shops">Annuaire</Link>
              <Link href="/auth/login">Connexion</Link>
              <Link className="marketing-button" href="/auth/signup">
                Créer ma boutique
              </Link>
            </nav>
          </details>
        </div>
      </header>

      <MarketingMotion>
        <section aria-labelledby="hero-title" className="marketing-hero">
          <div className="marketing-hero__copy" data-hero-intro>
            <p className="marketing-kicker">Votre commerce. En ligne.</p>
            <h1 id="hero-title">
              Faites grandir
              <br />
              votre <span>commerce.</span>
            </h1>
            <p className="marketing-hero__intro">
              Boutique, commandes et rendez-vous — simplement.
            </p>
            <div className="marketing-hero__actions">
              <Link className="marketing-button" href="/auth/signup">
                Créer ma boutique <span aria-hidden="true">→</span>
              </Link>
              <a className="marketing-text-link" href="#solutions">
                Découvrir <span aria-hidden="true">↓</span>
              </a>
            </div>
            <ul aria-label="Points forts" className="marketing-proof">
              <li>
                <span aria-hidden="true">✓</span> Mobile d’abord
              </li>
              <li>
                <span aria-hidden="true">✓</span> Offre gratuite
              </li>
            </ul>
          </div>
          <div
            className="marketing-hero__visual"
            data-hero-art
            id="demonstration"
          >
            <PlatformScene />
            <div
              aria-hidden="true"
              className="marketing-orbit marketing-orbit--one"
            />
            <div
              aria-hidden="true"
              className="marketing-orbit marketing-orbit--two"
            />
            <BusinessPreview />
          </div>
        </section>

        <section
          aria-label="Pour les commerces locaux"
          className="marketing-ribbon"
        >
          <span>Une vitrine toujours ouverte</span>
          <i aria-hidden="true" />
          <span>Des commandes mieux suivies</span>
          <i aria-hidden="true" />
          <span>Le commerce d’ici, partout</span>
        </section>

        <section
          aria-labelledby="benefits-title"
          className="marketing-section marketing-benefits"
          id="solutions"
        >
          <div className="marketing-section__heading" data-reveal>
            <p className="marketing-kicker">Une seule plateforme</p>
            <h2 id="benefits-title">
              Tout votre commerce.
              <br />
              <span>Au même endroit.</span>
            </h2>
          </div>
          <div className="benefit-grid" data-stagger="benefits">
            <MotionSurface className="benefit-card-motion">
              <article className="benefit-card" id="vitrine">
                <p className="benefit-card__number">
                  <span>01</span>
                  <span>VOTRE VITRINE</span>
                </p>
                <h3>Votre vitrine en ligne</h3>
                <p>Produits et services, réunis.</p>
                <a href="#fonctionnement">
                  Découvrir la vitrine <span aria-hidden="true">→</span>
                </a>
              </article>
            </MotionSurface>
            <MotionSurface className="benefit-card-motion">
              <article className="benefit-card" id="rendez-vous">
                <p className="benefit-card__number">
                  <span>02</span>
                  <span>VOTRE AGENDA</span>
                </p>
                <h3>Les rendez-vous, simplement</h3>
                <p>Créneaux et réservations réunis.</p>
                <a href="#fonctionnement">
                  Découvrir l’agenda <span aria-hidden="true">→</span>
                </a>
              </article>
            </MotionSurface>
            <MotionSurface className="benefit-card-motion">
              <article className="benefit-card" id="commandes">
                <p className="benefit-card__number">
                  <span>03</span>
                  <span>VOS COMMANDES</span>
                </p>
                <h3>Les demandes, bien suivies</h3>
                <p>Commandes et demandes, au même endroit.</p>
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
            <p className="marketing-kicker">Prêt quand vous l’êtes</p>
            <h2 id="steps-title">
              De votre idée
              <br />à votre boutique.
            </h2>
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
            <p className="marketing-kicker">Des offres lisibles</p>
            <h2 id="plans-title">Choisissez votre offre.</h2>
            <p>Des tarifs mensuels clairs, adaptés à votre activité.</p>
          </div>
          {error ? (
            <p className="plan-note" role="alert">
              Les offres ne sont pas disponibles pour le moment. Vous pouvez
              tout de même créer votre boutique gratuitement.
              <br />
              <Link href="/auth/signup">Commencer maintenant</Link>
            </p>
          ) : (
            <div className="plan-grid" data-stagger>
              {(plans ?? []).map((plan) => {
                const isPro = plan.code === "pro";
                const productLimit = getPlanProductLimit(plan.limits);
                const features = getPlanFeatures(plan.features);
                const benefitLabels = [
                  typeof productLimit === "number"
                    ? `Jusqu’à ${productLimit} produits`
                    : productLimit === null
                      ? "Produits illimités"
                      : "Catalogue de produits",
                  "Commandes en ligne",
                  "Partage de votre boutique",
                  ...features,
                ];

                return (
                  <article
                    className={`plan-card${isPro ? "plan-card--featured" : ""}`}
                    key={plan.code}
                  >
                    {isPro && <p className="plan-card__tag">Pour grandir</p>}
                    <p className="plan-card__name">{plan.name}</p>
                    <p className="plan-card__price">
                      <strong>
                        {plan.price_monthly === 0
                          ? "Gratuit"
                          : money.format(plan.price_monthly)}
                      </strong>
                      {plan.price_monthly > 0 && <span>FCFA / mois</span>}
                    </p>
                    <p className="plan-card__description">
                      {plan.code === "free"
                        ? "Pour lancer votre première vitrine."
                        : plan.code === "pro"
                          ? "Pour développer vos ventes et vos services."
                          : "Pour structurer votre activité."}
                    </p>
                    <ul>
                      {benefitLabels.map((label) => (
                        <li key={label}>
                          <span aria-hidden="true">✓</span>
                          {label}
                        </li>
                      ))}
                    </ul>
                    <Link
                      className={
                        isPro
                          ? "marketing-button"
                          : "marketing-button marketing-button--outline"
                      }
                      href="/auth/signup"
                    >
                      {plan.price_monthly === 0
                        ? "Créer ma boutique"
                        : "Choisir cette offre"}
                      <span aria-hidden="true">→</span>
                    </Link>
                  </article>
                );
              })}
            </div>
          )}
          {!error && (
            <p className="plan-note">
              Une question sur les offres ?{" "}
              <Link href="/auth/signup">Notre équipe peut vous orienter.</Link>
            </p>
          )}
        </section>

        <section aria-labelledby="trust-title" className="marketing-trust">
          <div data-reveal>
            <p className="marketing-kicker">Pensé pour les commerces d’ici</p>
            <h2 id="trust-title">
              Simple, même sur <span>téléphone.</span>
            </h2>
          </div>
          <div className="trust-points" data-stagger>
            <article>
              <span aria-hidden="true">◎</span>
              <div>
                <h3>Clair à utiliser</h3>
              </div>
            </article>
            <article>
              <span aria-hidden="true">⌁</span>
              <div>
                <h3>Paiement Mobile Money</h3>
              </div>
            </article>
            <article>
              <span aria-hidden="true">◇</span>
              <div>
                <h3>Vos données, votre activité</h3>
              </div>
            </article>
          </div>
        </section>

        <section
          aria-labelledby="faq-title"
          className="marketing-section marketing-faq"
        >
          <div className="marketing-section__heading" data-reveal>
            <p className="marketing-kicker">FAQ</p>
            <h2 id="faq-title">Une question ?</h2>
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
            <p className="marketing-kicker">À vous de jouer</p>
            <h2>Ouvrez votre boutique.</h2>
            <p>Votre commerce en ligne peut commencer aujourd’hui.</p>
            <div className="marketing-hero__actions">
              <Link className="marketing-button" href="/auth/signup">
                Créer ma boutique <span aria-hidden="true">→</span>
              </Link>
              <Link className="marketing-text-link" href="/shops">
                Voir l’annuaire
              </Link>
            </div>
          </div>
        </section>
      </MarketingMotion>

      <footer className="marketing-footer">
        <Link className="marketing-brand" href="/">
          <span aria-hidden="true" className="marketing-brand__mark">
            F
          </span>
          <span>Faso Studio</span>
        </Link>
        <p>Des commerces d’ici, visibles partout.</p>
        <nav aria-label="Navigation de pied de page">
          <Link href="/shops">Annuaire</Link>
          <Link href="/auth/login">Connexion</Link>
          <Link href="/auth/signup">Créer une boutique</Link>
        </nav>
        <small>© {new Date().getFullYear()} Faso Studio</small>
      </footer>
    </main>
  );
}
