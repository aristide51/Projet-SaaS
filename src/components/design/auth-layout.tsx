"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

// Truste la page d'accueil n'utilise pas GSAP côté client de façon synchrone
const HeroScene = dynamic(
  () => import("./hero-scene").then((m) => m.HeroScene),
  {
    ssr: false,
    loading: () => <div className="auth-hero__scene" aria-hidden="true" />,
  },
);

export function AuthLayout({
  rightContent,
  className,
}: {
  rightContent: ReactNode;
  className?: string;
}) {
  return (
    <main className={`auth-main auth-main--split ${className ?? ""}`}>
      <div className="auth-main__grid">
        {/* Colonne visuelle */}
        <div className="auth-main__visual">
          <div className="auth-main__brand">
            <span className="auth-main__brand-mark" aria-hidden="true">
              F
            </span>
            <span className="auth-main__brand-name">Faso Studio</span>
          </div>
          <div className="auth-main__copy">
            <p className="auth-main__eyebrow">Votre boutique, où vous voulez</p>
            <h1 className="auth-main__title">
              <span className="auth-main__line">Le numérique</span>
              <span className="auth-main__line">au service</span>
              <span className="auth-main__line">de votre commerce</span>
            </h1>
            <p className="auth-main__description">
              Gérez votre catalogue, vos commandes et vos rendez-vous depuis un
              outil pensé pour les commerces du Burkina Faso.
            </p>
          </div>
          <div className="auth-main__stats">
            <div className="auth-main__stat">
              <strong className="auth-main__stat-value">FCFA</strong>
              <p className="auth-main__stat-label">Paiements mobiles</p>
            </div>
            <div className="auth-main__stat">
              <strong className="auth-main__stat-value">0</strong>
              <p className="auth-main__stat-label">Sans contrat</p>
            </div>
          </div>
          <div className="auth-main__scene" aria-hidden="true">
            <HeroScene />
          </div>
        </div>

        {/* Colonne formulaire */}
        <div className="auth-main__form">{rightContent}</div>
      </div>
    </main>
  );
}
