import Link from "next/link";

export default function VerifyEmailPage() {
  return (
    <main className="auth-main">
      <section aria-labelledby="verify-email-title" className="auth-card">
        <p className="auth-eyebrow">Vérification requise</p>
        <h1 id="verify-email-title">Confirme ton adresse e-mail</h1>
        <p className="auth-description">
          Ouvre le message de confirmation envoyé à ton adresse e-mail. Tu
          pourras ensuite te connecter et accéder aux espaces protégés.
        </p>
        <Link className="ui-button ui-button--primary" href="/auth/login">
          Retour à la connexion
        </Link>
      </section>
    </main>
  );
}
