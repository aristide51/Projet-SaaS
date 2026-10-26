import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CheckoutForm } from "@/features/orders/checkout-form";
import { getCartSnapshot } from "@/features/cart/data";
import { getPublicShop } from "@/features/storefront/data";
import { logError } from "@/lib/monitoring/sentry";
import { createClient, getOptionalUser } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type PaymentMethod = Database["public"]["Enums"]["payment_method_type"];

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  ussd_orange: "Orange Money",
  ussd_moov: "Moov Money",
  ussd_coris: "Coris Money",
  cash_on_delivery: "Paiement à la livraison",
  pay_at_pickup: "Paiement au retrait",
  aggregator: "Paiement mobile sécurisé",
};

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ shop: string }>;
}) {
  const { shop: slug } = await params;
  const shop = await getPublicShop(slug);
  if (!shop) notFound();

  const user = await getOptionalUser();
  if (!user?.email_confirmed_at) {
    const next = `/${encodeURIComponent(slug)}/checkout`;
    redirect(`/auth/login?next=${encodeURIComponent(next)}`);
  }

  const supabase = await createClient();
  const [profileResult, settingsResult, methodsResult, cart] =
    await Promise.all([
      supabase.from("profiles").select("phone").eq("id", user.id).maybeSingle(),
      supabase
        .from("shop_settings")
        .select("pickup_enabled, delivery_enabled")
        .eq("shop_id", shop.id)
        .maybeSingle(),
      supabase
        .from("shop_payment_methods")
        .select("type")
        .eq("shop_id", shop.id)
        .eq("active", true),
      getCartSnapshot(shop.id),
    ]);

  if (profileResult.error || settingsResult.error || methodsResult.error) {
    const error =
      profileResult.error ?? settingsResult.error ?? methodsResult.error;
    await logError("checkout_page_data_failed", error);
    throw new Error(
      "Les informations de commande n’ont pas pu être chargées.",
      {
        cause: error,
      },
    );
  }

  if (!cart.items.length) {
    return (
      <main className="checkout-page">
        <section className="checkout-card">
          <p className="auth-eyebrow">{shop.name}</p>
          <h1>Ton panier est vide</h1>
          <p>Ajoute un article à ton panier avant de passer commande.</p>
          <Link
            className="ui-button ui-button--primary"
            href={`/${encodeURIComponent(slug)}`}
          >
            Retour à la boutique
          </Link>
        </section>
      </main>
    );
  }

  const paymentMethods = (methodsResult.data ?? []).map(({ type }) => ({
    type,
    label: PAYMENT_METHOD_LABELS[type],
  }));
  const fulfillmentOptions = {
    pickup: settingsResult.data?.pickup_enabled ?? false,
    delivery: settingsResult.data?.delivery_enabled ?? false,
  };

  return (
    <main className="checkout-page">
      <section className="checkout-card">
        <p className="auth-eyebrow">{shop.name}</p>
        <h1>Finaliser ma commande</h1>
        <p className="checkout-description">
          Vérifie les articles et le total avant de confirmer. Le prix est
          calculé par la boutique.
        </p>
        {!profileResult.data?.phone ? (
          <div className="checkout-notice" role="status">
            <strong>
              Ton numéro de téléphone est nécessaire pour commander.
            </strong>
            <Link href="/account">Compléter mon profil</Link>
          </div>
        ) : null}
        <CheckoutForm
          cart={cart}
          fulfillmentOptions={fulfillmentOptions}
          hasPhone={Boolean(profileResult.data?.phone)}
          paymentMethods={paymentMethods}
          shopId={shop.id}
          shopName={shop.name}
          shopSlug={shop.slug}
        />
      </section>
    </main>
  );
}
