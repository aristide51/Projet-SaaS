import Link from "next/link";

export default function DashboardPage() {
  return (
    <main className="auth-main">
      <section className="auth-card">
        <p className="auth-eyebrow">Espace commerçant</p>
        <h1>Tableau de bord</h1>
        <p>Configure ta boutique et gère son catalogue depuis cet espace.</p>
        <Link
          className="ui-button ui-button--primary"
          href="/dashboard/onboarding"
        >
          Ouvrir la mise en route
        </Link>
        <Link
          className="ui-button ui-button--secondary"
          href="/dashboard/catalog"
        >
          Gérer le catalogue
        </Link>
        <Link
          className="ui-button ui-button--secondary"
          href="/dashboard/orders"
        >
          Gérer les commandes
        </Link>
        <Link className="ui-button ui-button--secondary" href="/dashboard/team">
          Gérer mon équipe
        </Link>
        <Link
          className="ui-button ui-button--secondary"
          href="/dashboard/bookings"
        >
          Gérer les rendez-vous
        </Link>
        <Link
          className="ui-button ui-button--secondary"
          href="/dashboard/promotions"
        >
          Gérer les promotions
        </Link>
        <Link
          className="ui-button ui-button--secondary"
          href="/dashboard/reviews"
        >
          Répondre aux avis
        </Link>
        <Link
          className="ui-button ui-button--secondary"
          href="/dashboard/abonnement"
        >
          Gérer mon abonnement
        </Link>
        <Link
          className="ui-button ui-button--secondary"
          href="/dashboard/payments"
        >
          Paiement automatique
        </Link>
      </section>
    </main>
  );
}
