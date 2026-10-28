import Link from "next/link";
import type { Metadata } from "next";
import { MarketingMotion } from "@/components/design/marketing-motion";
import { PlatformScene } from "@/components/design/platform-scene";
import { createClient } from "@/lib/supabase/server";

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
    title: "Créez votre espace",
    description:
      "Présentez votre activité, vos horaires et vos moyens de contact depuis un parcours guidé.",
  },
  {
    number: "02",
    title: "Ajoutez votre offre",
    description:
      "Publiez vos produits ou services et partagez votre boutique en un lien.",
  },
  {
    number: "03",
    title: "Recevez vos clients",
    description:
      "Suivez les commandes et rendez-vous depuis un tableau de bord clair sur téléphone.",
  },
];

const faqs = [
  {
    question: "Faut-il savoir créer un site web ?",
    answer:
      "Non. Le parcours guidé vous aide à présenter votre commerce et à publier votre boutique sans écrire de code.",
  },
  {
    question: "Comment les clients peuvent-ils payer ?",
    answer:
      "Vous pouvez proposer les moyens de paiement disponibles pour votre boutique. Au lancement, les paiements Mobile Money sont déclarés par le client puis vérifiés par le commerçant.",
  },
  {
    question: "Est-ce adapté à un téléphone modeste ?",
    answer:
      "Oui. Le tableau de bord est conçu d’abord pour le mobile, et vos clients peuvent consulter les pages publiques sans installer d’application.",
  },
  {
    question: "Puis-je gérer des rendez-vous ?",
    answer:
      "Les commerces de services peuvent configurer leurs horaires et laisser leurs clients réserver un créneau en ligne avec un plan compatible.",
  },
];

export default async function HomePage() {
  const supabase = await createClient();
  const { data: plans, error } = await supabase
    .from("plans")
    .select("code, name, price_monthly, limits, features")
    .eq("active", true)
    .order("sort_order");

  if (error) {
    throw new Error("Impossible de charger les offres de la plateforme.", {
      cause: error,
    });
  }

  const money = new Intl.NumberFormat("fr-FR");

  return (
    <main id="contenu" className="marketing-home">
      <a className="marketing-skip-link" href="#hero-title">
        Aller au contenu principal
      </a>
      <header className="marketing-header">
        <Link className="marketing-brand" href="/">
          <span aria-hidden="true" className="marketing-brand__mark">
            F
          </span>
          <span>Faso Studio</span>
        </Link>
        <nav aria-label="Navigation principale" className="marketing-nav">
          <a href="#fonctionnement">Comment ça marche</a>
          <a href="#offres">Offres</a>
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
      </header>

      <MarketingMotion>
        <section aria-labelledby="hero-title" className="marketing-hero">
          <div className="marketing-hero__copy" data-reveal>
            <p className="marketing-kicker">
              <span aria-hidden="true" className="marketing-kicker__dot" />
              Le numérique au rythme des commerces d’ici
            </p>
            <h1 id="hero-title">
              Votre commerce mérite <span>sa place en ligne.</span>
            </h1>
            <p className="marketing-hero__intro">
              Une boutique simple à partager. Des commandes et rendez-vous mieux
              organisés. Un outil pensé pour les réalités des commerçants du
              Burkina Faso.
            </p>
            <div className="marketing-hero__actions">
              <Link className="marketing-button" href="/auth/signup">
                Ouvrir ma boutique
                <span aria-hidden="true">→</span>
              </Link>
              <a className="marketing-text-link" href="#demonstration">
                Découvrir la plateforme <span aria-hidden="true">↓</span>
              </a>
            </div>
            <ul aria-label="Points forts" className="marketing-proof">
              <li>
                <span aria-hidden="true">✓</span> Mise en route guidée
              </li>
              <li>
                <span aria-hidden="true">✓</span> Pensée pour le mobile
              </li>
              <li>
                <span aria-hidden="true">✓</span> Offre gratuite disponible
              </li>
            </ul>
          </div>
          <div
            aria-label="Aperçu illustré du tableau de bord de Faso Studio"
            className="marketing-hero__visual"
            data-reveal
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
            <div className="dashboard-preview">
              <div className="dashboard-preview__top">
                <span className="dashboard-preview__brand">
                  <span aria-hidden="true">F</span> Faso Studio
                </span>
                <span
                  className="dashboard-preview__avatar"
                  aria-label="Profil du commerçant"
                >
                  A
                </span>
              </div>
              <div className="dashboard-preview__body">
                <p className="dashboard-preview__eyebrow">
                  MARDI · VOTRE ACTIVITÉ
                </p>
                <h2>Bonjour, Awa 👋</h2>
                <p className="dashboard-preview__muted">
                  Votre boutique avance bien cette semaine.
                </p>
                <div className="dashboard-preview__stats">
                  <div>
                    <span>Commandes</span>
                    <strong>12</strong>
                    <small>Cette semaine</small>
                  </div>
                  <div>
                    <span>À préparer</span>
                    <strong>03</strong>
                    <small>À traiter</small>
                  </div>
                </div>
                <div className="dashboard-preview__order">
                  <span
                    aria-hidden="true"
                    className="dashboard-preview__order-icon"
                  >
                    ↗
                  </span>
                  <span>
                    <strong>Nouvelle commande</strong>
                    <small>Reçue à l’instant</small>
                  </span>
                  <span className="dashboard-preview__badge">À voir</span>
                </div>
              </div>
              <div className="dashboard-preview__footer">
                <span>
                  <i /> Boutique en ligne
                </span>
                <span>Voir ma boutique ↗</span>
              </div>
            </div>
            <div className="hero-note hero-note--orders">
              <span aria-hidden="true">✦</span>
              Votre activité, au même endroit
            </div>
            <div className="hero-note hero-note--money">
              <span aria-hidden="true">＋</span>
              Simple sur téléphone
            </div>
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
          <span>Le savoir-faire d’ici, visible partout</span>
        </section>

        <section
          aria-labelledby="benefits-title"
          className="marketing-section marketing-benefits"
        >
          <div className="marketing-section__heading" data-reveal>
            <p className="marketing-kicker">Tout commence simplement</p>
            <h2 id="benefits-title">
              Moins de dispersion.
              <br />
              <span>Plus de place pour votre métier.</span>
            </h2>
            <p>
              Les bons outils pour accueillir vos clients, sans compliquer vos
              journées.
            </p>
          </div>
          <div className="benefit-grid" data-stagger>
            <article className="benefit-card">
              <span
                aria-hidden="true"
                className="benefit-card__icon benefit-card__icon--catalog"
              >
                ▦
              </span>
              <p className="benefit-card__number">01 / VOTRE VITRINE</p>
              <h3>Vos produits, bien présentés</h3>
              <p>
                Montrez votre catalogue, vos prix et vos nouveautés dans une
                page facile à envoyer à vos clients.
              </p>
              <a href="#fonctionnement">
                Découvrir le parcours <span aria-hidden="true">→</span>
              </a>
            </article>
            <article className="benefit-card">
              <span
                aria-hidden="true"
                className="benefit-card__icon benefit-card__icon--booking"
              >
                ◷
              </span>
              <p className="benefit-card__number">02 / VOTRE AGENDA</p>
              <h3>Vos rendez-vous, sans appels manqués</h3>
              <p>
                Proposez des créneaux clairs et retrouvez les réservations dans
                votre espace commerçant.
              </p>
              <a href="#fonctionnement">
                Voir comment ça marche <span aria-hidden="true">→</span>
              </a>
            </article>
            <article className="benefit-card">
              <span
                aria-hidden="true"
                className="benefit-card__icon benefit-card__icon--orders"
              >
                ↗
              </span>
              <p className="benefit-card__number">03 / VOS COMMANDES</p>
              <h3>Le suivi, au même endroit</h3>
              <p>
                Consultez les demandes, mettez à jour leur état et accompagnez
                vos clients à chaque étape.
              </p>
              <a href="#offres">
                Choisir mon offre <span aria-hidden="true">→</span>
              </a>
            </article>
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
            <p>
              Pas besoin d’équipe technique. Vous gardez la main sur votre
              activité, à chaque étape.
            </p>
            <Link
              className="marketing-button marketing-button--light"
              href="/auth/signup"
            >
              Commencer gratuitement <span aria-hidden="true">→</span>
            </Link>
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
        </section>

        <section
          aria-labelledby="plans-title"
          className="marketing-section marketing-plans"
          id="offres"
        >
          <div className="marketing-section__heading" data-reveal>
            <p className="marketing-kicker">Des offres lisibles</p>
            <h2 id="plans-title">
              Commencez léger.
              <br />
              <span>Évoluez à votre rythme.</span>
            </h2>
            <p>
              Choisissez l’accompagnement adapté à votre commerce. Les prix
              affichés sont mensuels.
            </p>
          </div>
          <div className="plan-grid" data-stagger>
            {(plans ?? []).map((plan) => {
              const isPro = plan.code === "pro";
              const limits = asRecord(plan.limits);
              const features = asRecord(plan.features);
              const productLimit = limits.max_products;
              const benefitLabels = [
                typeof productLimit === "number"
                  ? `Jusqu’à ${productLimit} produits`
                  : "Catalogue de produits",
                "Commandes en ligne",
                "Partage de votre boutique",
                ...(features.bookings === true ? ["Rendez-vous en ligne"] : []),
                ...(features.promotions === true ? ["Promotions"] : []),
                ...(features.analytics === true
                  ? ["Statistiques d’activité"]
                  : []),
                ...(features.priority_support === true
                  ? ["Support prioritaire"]
                  : []),
              ];
              return (
                <article
                  className={`plan-card${isPro ? "plan-card--featured" : ""}`}
                  key={plan.code}
                >
                  {isPro ? (
                    <p className="plan-card__tag">Pour grandir</p>
                  ) : null}
                  <p className="plan-card__name">{plan.name}</p>
                  <p className="plan-card__price">
                    <strong>
                      {plan.price_monthly === 0
                        ? "Gratuit"
                        : money.format(plan.price_monthly)}
                    </strong>
                    {plan.price_monthly > 0 ? <span>FCFA / mois</span> : null}
                  </p>
                  <p className="plan-card__description">
                    {plan.code === "free"
                      ? "Pour lancer votre première vitrine."
                      : plan.code === "pro"
                        ? "Pour développer vos ventes et vos services."
                        : "Pour structurer une activité en pleine croissance."}
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
          <p className="plan-note">
            Une question sur les offres ?{" "}
            <Link href="/auth/signup">Notre équipe peut vous orienter.</Link>
          </p>
        </section>

        <section aria-labelledby="trust-title" className="marketing-trust">
          <div data-reveal>
            <p className="marketing-kicker">
              Construit avec le terrain en tête
            </p>
            <h2 id="trust-title">
              Votre commerce est unique.
              <br />
              <span>Votre outil doit l’être aussi.</span>
            </h2>
            <p>
              Nous préparons Faso Studio avec les besoins des commerces locaux
              au cœur du produit : téléphones modestes, connexions variables et
              échanges directs avec les clients.
            </p>
          </div>
          <div className="trust-points" data-stagger>
            <article>
              <span aria-hidden="true">◎</span>
              <div>
                <h3>Simple à prendre en main</h3>
                <p>Des actions claires et des mots du quotidien.</p>
              </div>
            </article>
            <article>
              <span aria-hidden="true">⌁</span>
              <div>
                <h3>Adapté aux réalités locales</h3>
                <p>Mobile Money, horaires et habitudes de commerce d’ici.</p>
              </div>
            </article>
            <article>
              <span aria-hidden="true">◇</span>
              <div>
                <h3>Vous gardez le contrôle</h3>
                <p>
                  Vos produits et vos échanges restent au centre de votre
                  activité.
                </p>
              </div>
            </article>
          </div>
        </section>

        <section
          aria-labelledby="pilot-feedback-title"
          className="marketing-pilot-feedback"
        >
          <div className="marketing-pilot-feedback__mark" aria-hidden="true">
            “
          </div>
          <div>
            <p className="marketing-kicker">La parole aux commerces</p>
            <h2 id="pilot-feedback-title">
              Un produit qui se construit avec le terrain.
            </h2>
            <p>
              Les retours et témoignages des commerces pilotes seront publiés
              ici avec leur accord. Nous préférons partager des expériences
              réelles plutôt que des avis inventés.
            </p>
          </div>
        </section>

        <section
          aria-labelledby="faq-title"
          className="marketing-section marketing-faq"
        >
          <div className="marketing-section__heading" data-reveal>
            <p className="marketing-kicker">Questions fréquentes</p>
            <h2 id="faq-title">Avant de vous lancer.</h2>
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

        <section
          aria-labelledby="final-cta-title"
          className="marketing-final-cta"
        >
          <p className="marketing-kicker">Le prochain pas est simple</p>
          <h2 id="final-cta-title">
            Faites connaître
            <br />
            ce que vous faites de mieux.
          </h2>
          <p>Votre boutique en ligne peut commencer aujourd’hui.</p>
          <Link
            className="marketing-button marketing-button--light"
            href="/auth/signup"
          >
            Créer ma boutique <span aria-hidden="true">→</span>
          </Link>
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

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
