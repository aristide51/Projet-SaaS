import Link from "next/link";
import { headers } from "next/headers";
import { getSafeRedirectPath } from "@/lib/auth/redirect";
import { AuthForm, type AuthMode } from "./auth-form";
import { AuthLayout } from "@/components/design/auth-layout";

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
    <AuthLayout
      leftContent={
        mode === "login" ? (
          <aside
            aria-label="À propos de Faso Studio"
            className="auth-login-aside"
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
                <span aria-hidden="true" /> Le commerce local, connecté
              </p>
              <p className="auth-login-aside__title">
                Faites grandir votre commerce, simplement.
              </p>
              <p className="auth-login-aside__description">
                Votre boutique, vos commandes et vos rendez-vous, dans un espace
                pensé pour votre quotidien.
              </p>
              <ul className="auth-login-aside__features">
                <li>Votre boutique en ligne</li>
                <li>Vos commandes et rendez-vous</li>
              </ul>
            </div>
            <p className="auth-login-aside__footnote">
              Conçu au Burkina Faso, pour les commerces d’ici.
            </p>
          </aside>
        ) : null
      }
      rightContent={
        <AuthForm
          mode={mode}
          next={safeNext}
          nonce={requestHeaders.get("x-nonce") ?? ""}
          siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? ""}
        />
      }
    />
  );
}
