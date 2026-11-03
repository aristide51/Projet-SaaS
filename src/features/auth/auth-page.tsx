import Link from "next/link";
import { headers } from "next/headers";
import { getSafeRedirectPath } from "@/lib/auth/redirect";
import { AuthForm, type AuthMode } from "./auth-form";
import { AuthLayout } from "@/components/design/auth-layout";
import { BrandUtilityBar } from "@/components/design/brand-utility-bar";
import { MarketingMotion } from "@/components/design/marketing-motion";

export async function AuthPage({
  mode,
  next,
}: {
  mode: AuthMode;
  next?: string;
}) {
  const requestHeaders = await headers();
  const safeNext = getSafeRedirectPath(next);

  return (
    <MarketingMotion>
      <BrandUtilityBar />
      <AuthLayout
        {...(mode === "signup"
          ? {
              className: "auth-main--signup",
              leftContent: <SignupAside />,
            }
          : {})}
        showLoginAside={mode === "login"}
        rightContent={
          <AuthForm
            mode={mode}
            next={safeNext}
            nonce={requestHeaders.get("x-nonce") ?? ""}
            siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""}
          />
        }
      />
    </MarketingMotion>
  );
}

function SignupAside() {
  return (
    <aside
      aria-label="Pourquoi créer un compte Faso Studio"
      className="auth-login-aside auth-signup-aside"
    >
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
        <p className="auth-login-aside__eyebrow">
          <span aria-hidden="true" /> Le commerce local, en plus simple
        </p>
        <p className="auth-login-aside__title">
          Votre boutique mérite un espace à elle.
        </p>
        <p className="auth-login-aside__description">
          Présentez vos produits, suivez les commandes et gardez vos rendez-vous
          au même endroit.
        </p>
        <ul className="auth-login-aside__features">
          <li>Une boutique facile à partager</li>
          <li>Commandes et rendez-vous réunis</li>
          <li>Suivi des paiements en FCFA</li>
        </ul>
      </div>
      <p className="auth-login-aside__footnote">
        Conçu au Burkina Faso, pour les commerces locaux.
      </p>
    </aside>
  );
}
