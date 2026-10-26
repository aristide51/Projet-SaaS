import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

type PreviewPageProps = {
  searchParams: Promise<{ shop?: string }>;
};

export default async function ShopPreviewPage({
  searchParams,
}: PreviewPageProps) {
  const user = await requireVerifiedUser();
  const { shop: shopId } = await searchParams;
  if (!shopId) notFound();

  const supabase = await createClient();
  const { data: shop, error: shopError } = await supabase
    .from("shops")
    .select(
      "id, name, slug, description, category, logo_path, brand_color, whatsapp, phone, city, district, address, review_status",
    )
    .eq("id", shopId)
    .eq("created_by", user.id)
    .maybeSingle();

  if (shopError) {
    throw new Error("Impossible de charger l’aperçu de ta boutique.", {
      cause: shopError,
    });
  }
  if (!shop || shop.review_status === "approved") notFound();

  const [productsResult, servicesResult, paymentResult] = await Promise.all([
    supabase
      .from("products")
      .select("id, name, description, price, status, is_sample, deleted_at")
      .eq("shop_id", shop.id)
      .eq("is_sample", false)
      .is("deleted_at", null)
      .neq("status", "hidden")
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("services")
      .select("id, name, description, price, active, is_sample, deleted_at")
      .eq("shop_id", shop.id)
      .eq("active", true)
      .eq("is_sample", false)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(12),
    supabase
      .from("shop_payment_methods")
      .select("type, phone_or_code, ussd_template")
      .eq("shop_id", shop.id)
      .eq("active", true)
      .in("type", [
        "ussd_orange",
        "ussd_moov",
        "cash_on_delivery",
        "pay_at_pickup",
      ]),
  ]);
  const dataError =
    productsResult.error ?? servicesResult.error ?? paymentResult.error;
  if (dataError) {
    throw new Error("Impossible de charger les éléments de l’aperçu.", {
      cause: dataError,
    });
  }

  const logoUrl = shop.logo_path
    ? supabase.storage.from("shop-assets").getPublicUrl(shop.logo_path).data
        .publicUrl
    : null;
  const catalog = [
    ...(productsResult.data ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      price: item.price,
      kind: "Produit",
    })),
    ...(servicesResult.data ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      description: item.description,
      price: item.price,
      kind: "Service",
    })),
  ];

  return (
    <main className="shop-preview-shell">
      <header className="shop-preview-toolbar">
        <div>
          <p className="auth-eyebrow">Aperçu privé</p>
          <h1>Aperçu, pas encore publié</h1>
          <p>Seul le propriétaire connecté peut voir cette page.</p>
        </div>
        <Link
          className="ui-button ui-button--secondary"
          href={`/dashboard/onboarding?shop=${encodeURIComponent(shop.id)}`}
        >
          Retour à la mise en route
        </Link>
      </header>

      <div className="shop-preview-devices">
        {(["mobile", "desktop"] as const).map((device) => (
          <section
            aria-label={`Aperçu sur ${device === "mobile" ? "téléphone" : "ordinateur"}`}
            className={`shop-preview-device shop-preview-device--${device}`}
            key={device}
          >
            <div className="shop-preview-banner">
              Aperçu, pas encore publié
            </div>
            <div className="shop-preview-store">
              <header
                className="shop-preview-store__header"
                style={{ borderBottomColor: shop.brand_color }}
              >
                {logoUrl ? (
                  <Image
                    alt={`Logo de ${shop.name}`}
                    height={64}
                    src={logoUrl}
                    unoptimized
                    width={64}
                  />
                ) : (
                  <div className="shop-preview-logo" aria-hidden="true">
                    {getInitials(shop.name)}
                  </div>
                )}
                <div>
                  <p>{shop.category.replaceAll("_", " ")}</p>
                  <h2>{shop.name}</h2>
                </div>
              </header>
              {shop.description ? <p>{shop.description}</p> : null}
              <p>
                {[shop.district, shop.city].filter(Boolean).join(", ") ||
                  "Adresse non renseignée"}
              </p>
              <div className="shop-preview-contact">
                {shop.whatsapp ? (
                  <a
                    className="ui-button ui-button--primary ui-button--sm"
                    href={`https://wa.me/${shop.whatsapp.replace(/\D/g, "")}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    WhatsApp
                  </a>
                ) : null}
                {shop.phone ? (
                  <a
                    className="ui-button ui-button--secondary ui-button--sm"
                    href={`tel:${shop.phone}`}
                  >
                    Appeler
                  </a>
                ) : null}
              </div>
              <section className="shop-preview-catalog">
                <h3>Catalogue</h3>
                {catalog.length ? (
                  <ul>
                    {catalog.map((item) => (
                      <li key={`${item.kind}-${item.id}`}>
                        <div>
                          <small>{item.kind}</small>
                          <h4>{item.name}</h4>
                          {item.description ? <p>{item.description}</p> : null}
                        </div>
                        <strong>
                          {new Intl.NumberFormat("fr-FR").format(item.price)}{" "}
                          FCFA
                        </strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Aucun produit ou service n’est encore visible.</p>
                )}
              </section>
              <section className="shop-preview-catalog">
                <h3>Modes d’encaissement</h3>
                {paymentResult.data?.length ? (
                  <ul>
                    {paymentResult.data.map((method) => (
                      <li key={method.type}>
                        <span>{paymentMethodLabel(method.type)}</span>
                        {method.phone_or_code ? (
                          <strong>{method.phone_or_code}</strong>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>Aucun mode d’encaissement configuré.</p>
                )}
              </section>
              {shop.address ? (
                <p className="shop-preview-address">{shop.address}</p>
              ) : null}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toLocaleUpperCase("fr");
}

function paymentMethodLabel(type: string) {
  const labels: Record<string, string> = {
    ussd_orange: "Orange Money",
    ussd_moov: "Moov Money",
    cash_on_delivery: "Espèces à la livraison",
    pay_at_pickup: "Espèces au retrait",
  };
  return labels[type] ?? "Autre mode d’encaissement";
}
