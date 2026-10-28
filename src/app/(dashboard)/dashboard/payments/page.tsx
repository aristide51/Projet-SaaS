import Link from "next/link";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

type PaymentsPageProps = {
  searchParams: Promise<{ shop?: string }>;
};

export default async function PaymentsPage({
  searchParams,
}: PaymentsPageProps) {
  const user = await requireVerifiedUser();
  const params = await searchParams;
  const supabase = await createClient();
  const { data: memberships, error: membershipError } = await supabase
    .from("shop_members")
    .select("shop_id")
    .eq("user_id", user.id)
    .eq("role", "owner");

  if (membershipError) {
    throw new Error("Impossible de charger les boutiques.", {
      cause: membershipError,
    });
  }

  const shopIds = (memberships ?? []).map((membership) => membership.shop_id);
  const { data: shops, error: shopsError } = shopIds.length
    ? await supabase
        .from("shops")
        .select("id, name")
        .in("id", shopIds)
        .order("created_at", { ascending: false })
    : { data: [], error: null };
  if (shopsError) {
    throw new Error("Impossible de charger les boutiques.", {
      cause: shopsError,
    });
  }

  const shop = params.shop
    ? (shops ?? []).find((item) => item.id === params.shop)
    : shops?.[0];
  const enabled = process.env.PAYMENT_AGGREGATOR_ENABLED === "true";

  return (
    <main className="auth-main">
      <section className="auth-card">
        <p className="auth-eyebrow">Espace commerçant</p>
        <h1>Paiement automatique</h1>
        {shop ? <p>Boutique : {shop.name}</p> : null}
        <div role="status">
          <h2>
            {enabled
              ? "Aucun fournisseur n’est encore validé"
              : "Connexion désactivée"}
          </h2>
          <p>
            {enabled
              ? "L’intégration reste bloquée tant que les réponses écrites des fournisseurs et leur sandbox ne sont pas validées."
              : "La connexion des clés reste désactivée jusqu’à la validation écrite d’un fournisseur et de sa sandbox."}
          </p>
          <p>
            Les clés ne sont pas demandées ni enregistrées dans cette version.
            Lors de l’activation, leur saisie devra être chiffrée côté serveur
            et protégée par une réauthentification.
          </p>
        </div>
        <Link className="ui-button ui-button--secondary" href="/dashboard">
          Retour au tableau de bord
        </Link>
      </section>
    </main>
  );
}
