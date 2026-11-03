import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { HeroScene } from "./hero-scene";
import { SiteShell } from "./site-shell";

export function AuthLayout({
  showLoginAside = false,
  leftContent,
  rightContent,
  className,
}: {
  showLoginAside?: boolean;
  leftContent?: ReactNode;
  rightContent: ReactNode;
  className?: string;
}) {
  return (
    <SiteShell>
      <main
        className={`auth-main auth-main--split ${className ?? ""}`}
        data-motion-page
      >
        <div className="auth-main__grid">
          <div className="auth-main__visual" data-reveal>
            {showLoginAside ? (
              <aside
                aria-label="À propos de Faso Studio"
                className="auth-login-aside"
              >
                <div className="auth-login-aside__photo">
                  <Image
                    alt="Commerçante burkinabè présentant son ordinateur portable."
                    className="auth-login-aside__image"
                    fill
                    preload
                    sizes="(max-width: 1023px) 100vw, 55vw"
                    src="/images/hero-boutique.png"
                  />
                </div>
                <Link
                  aria-label="Faso Studio, accueil"
                  className="auth-login-aside__brand"
                  href="/"
                >
                  <span aria-hidden="true" className="auth-login-aside__mark">
                    F
                  </span>
                  <span>Faso Studio</span>
                </Link>
                <div className="auth-login-aside__content">
                  <ul className="auth-login-aside__features">
                    <li>Votre boutique en ligne</li>
                    <li>Vos commandes et rendez-vous</li>
                  </ul>
                </div>
              </aside>
            ) : (
              (leftContent ?? (
                <>
                  <div className="auth-main__brand">
                    <span className="auth-main__brand-mark" aria-hidden="true">
                      F
                    </span>
                    <span className="auth-main__brand-name">Faso Studio</span>
                  </div>
                  <div className="auth-main__copy">
                    <p className="auth-main__eyebrow">
                      Votre boutique, où vous voulez
                    </p>
                    <h1 className="auth-main__title">
                      <span className="auth-main__line">Le numérique</span>
                      <span className="auth-main__line">au service</span>
                      <span className="auth-main__line">de votre commerce</span>
                    </h1>
                    <p className="auth-main__description">
                      Gérez votre catalogue, vos commandes et vos rendez-vous
                      depuis un outil pensé pour les commerces du Burkina Faso.
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
                </>
              ))
            )}
          </div>
          <div className="auth-main__form" data-reveal>
            {rightContent}
          </div>
        </div>
      </main>
    </SiteShell>
  );
}
