import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { InvoiceReceiptButton } from "@/features/subscriptions/invoice-receipt-button";

type Plan = {
  id: string;
  code: string;
  name: string;
  price_monthly: number;
  limits: unknown;
  features: unknown;
};

const featureLabels = [
  ["bookings", "Rendez-vous"],
  ["promotions", "Promotions"],
  ["analytics", "Statistiques"],
  ["priority_support", "Support prioritaire"],
] as const;

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams: Promise<{ shop?: string; invoicePage?: string }>;
}) {
  const user = await requireVerifiedUser();
  const params = await searchParams;
  const supabase = await createClient();
  const { data: memberships, error: membershipError } = await supabase
    .from("shop_members")
    .select("shop_id")
    .eq("user_id", user.id)
    .eq("role", "owner");

  if (membershipError) {
    throw new Error("Impossible de charger tes boutiques.", {
      cause: membershipError,
    });
  }

  const shopIds = (memberships ?? []).map((membership) => membership.shop_id);
  if (shopIds.length === 0) {
    return (
      <main className="team-shell">
        <section className="team-section">
          <h1>Abonnement</h1>
          <p>Crée une boutique pour consulter son abonnement et ses limites.</p>
          <Link
            className="ui-button ui-button--primary"
            href="/dashboard/onboarding"
          >
            Créer ma boutique
          </Link>
        </section>
      </main>
    );
  }

  const [shopsResult, plansResult] = await Promise.all([
    supabase
      .from("shops")
      .select("id, name")
      .in("id", shopIds)
      .order("created_at", { ascending: false }),
    supabase
      .from("plans")
      .select("id, code, name, price_monthly, limits, features")
      .eq("active", true)
      .order("sort_order"),
  ]);
  if (shopsResult.error || plansResult.error) {
    throw new Error("Impossible de charger les plans et les boutiques.", {
      cause: shopsResult.error ?? plansResult.error,
    });
  }

  const shops = shopsResult.data ?? [];
  const selectedShop = params.shop
    ? shops.find((shop) => shop.id === params.shop)
    : shops[0];
  if (!selectedShop) {
    return (
      <main className="team-shell">
        <section className="team-section" role="alert">
          <h1>Boutique introuvable</h1>
          <p>Tu n’es pas propriétaire de cette boutique.</p>
          <Link className="ui-button ui-button--secondary" href="/dashboard">
            Retour au tableau de bord
          </Link>
        </section>
      </main>
    );
  }

  const requestedInvoicePage = parsePage(params.invoicePage);
  const invoicesPerPage = 25;
  const [
    subscriptionResult,
    productCountResult,
    productLimitResult,
    membersResult,
    invitationsResult,
    staffLimitResult,
    invoicesResult,
  ] = await Promise.all([
    supabase
      .from("subscriptions")
      .select("plan_id, status, current_period_end, grace_until")
      .eq("shop_id", selectedShop.id)
      .maybeSingle(),
    supabase
      .from("products")
      .select("id", { count: "exact", head: true })
      .eq("shop_id", selectedShop.id)
      .eq("is_sample", false)
      .is("deleted_at", null),
    supabase.rpc("catalog_product_limit", { p_shop: selectedShop.id }),
    supabase.from("shop_members").select("role").eq("shop_id", selectedShop.id),
    supabase
      .from("shop_invitations")
      .select("status, expires_at")
      .eq("shop_id", selectedShop.id)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString()),
    supabase.rpc("shop_staff_limit", { p_shop: selectedShop.id }),
    supabase
      .from("invoices")
      .select(
        "id, invoice_number, amount, status, period_start, period_end, due_at, paid_at",
        { count: "exact" },
      )
      .eq("shop_id", selectedShop.id)
      .order("period_end", { ascending: false })
      .range(
        (requestedInvoicePage - 1) * invoicesPerPage,
        requestedInvoicePage * invoicesPerPage - 1,
      ),
  ]);

  for (const result of [
    subscriptionResult,
    productCountResult,
    productLimitResult,
    membersResult,
    invitationsResult,
    staffLimitResult,
    invoicesResult,
  ]) {
    if (result.error) {
      throw new Error("Impossible de charger l’abonnement et ses limites.", {
        cause: result.error,
      });
    }
  }

  const invoiceCount = invoicesResult.count ?? 0;
  const totalInvoicePages = Math.max(
    1,
    Math.ceil(invoiceCount / invoicesPerPage),
  );
  const invoicePage = Math.min(requestedInvoicePage, totalInvoicePages);
  let invoiceRows = invoicesResult.data ?? [];
  if (invoicePage !== requestedInvoicePage) {
    const { data, error } = await supabase
      .from("invoices")
      .select(
        "id, invoice_number, amount, status, period_start, period_end, due_at, paid_at",
      )
      .eq("shop_id", selectedShop.id)
      .order("period_end", { ascending: false })
      .range(
        (invoicePage - 1) * invoicesPerPage,
        invoicePage * invoicesPerPage - 1,
      );
    if (error) {
      throw new Error("Impossible de charger l’historique des factures.", {
        cause: error,
      });
    }
    invoiceRows = data ?? [];
  }

  const plans: Plan[] = plansResult.data ?? [];
  const freePlan = plans.find((plan) => plan.code === "free");
  if (!freePlan) {
    throw new Error("Le plan Gratuit actif est introuvable.");
  }
  const subscription = subscriptionResult.data;
  const effectivePlanId =
    subscription?.status === "expired"
      ? freePlan.id
      : (subscription?.plan_id ?? freePlan.id);
  const currentPlan =
    plans.find((plan) => plan.id === effectivePlanId) ??
    (subscription?.status !== "expired" && subscription
      ? {
          id: subscription.plan_id,
          code: "unavailable",
          name: "Plan existant",
          price_monthly: 0,
          limits: {},
          features: {},
        }
      : freePlan);
  const productCount = productCountResult.count ?? 0;
  const staffCount = (membersResult.data ?? []).filter(
    (member) => member.role === "staff",
  ).length;
  const pendingInvitationCount = (invitationsResult.data ?? []).length;
  const staffUsage = staffCount + pendingInvitationCount;
  const productLimit = productLimitResult.data;
  const staffLimit = staffLimitResult.data;
  const supportLink = createSupportLink(currentPlan.name);

  return (
    <main className="team-shell">
      <header className="team-header">
        <div>
          <p className="auth-eyebrow">Espace commerçant</p>
          <h1>Abonnement</h1>
          <p>Plan, échéance et consommation de {selectedShop.name}.</p>
        </div>
        {shops.length > 1 ? (
          <nav aria-label="Choisir une boutique">
            {shops.map((shop) => (
              <Link
                aria-current={shop.id === selectedShop.id ? "page" : undefined}
                href={`/dashboard/abonnement?shop=${encodeURIComponent(shop.id)}`}
                key={shop.id}
              >
                {shop.name}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>

      <section className="team-section">
        <h2>Ton plan actuel : {currentPlan.name}</h2>
        <p>
          {subscription?.status === "expired"
            ? "L’ancien abonnement a expiré. Les limites du plan Gratuit s’appliquent."
            : subscription?.status === "past_due"
              ? "Le paiement de l’abonnement est en attente."
              : "Abonnement actif."}
        </p>
        <p>
          {subscription?.current_period_end
            ? `Fin de période : ${formatDate(subscription.current_period_end)}`
            : "Aucune échéance enregistrée."}
        </p>
        {subscription?.grace_until ? (
          <p>
            Période de grâce jusqu’au {formatDate(subscription.grace_until)}.
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <UsageMeter
            label="Produits"
            used={productCount}
            limit={productLimit}
            unit="produits"
          />
          <UsageMeter
            label="Équipe"
            used={staffUsage}
            limit={staffLimit}
            unit="places"
            detail="Les invitations en attente sont comptées."
          />
        </div>
      </section>

      <section className="team-section">
        <h2>Comparer les plans</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((plan) => {
            const isCurrent = plan.id === currentPlan.id;
            const isUpgrade = plan.price_monthly > currentPlan.price_monthly;
            return (
              <article
                className="rounded-2xl border border-[var(--border-subtle)] p-5"
                key={plan.id}
              >
                <h3>{plan.name}</h3>
                <p className="text-xl font-semibold">
                  {formatPrice(plan.price_monthly)}
                  <span className="text-sm font-normal"> / mois</span>
                </p>
                <ul>
                  <li>
                    {formatLimit(readLimit(plan.limits, "max_products"))}{" "}
                    produits
                  </li>
                  <li>
                    {formatLimit(readLimit(plan.limits, "max_staff"))} places
                    d’équipe
                  </li>
                  {featureLabels.map(([key, label]) => (
                    <li key={key}>
                      {readFeature(plan.features, key)
                        ? "Inclus"
                        : "Non inclus"}{" "}
                      : {label}
                    </li>
                  ))}
                </ul>
                {isCurrent ? (
                  <p aria-current="true">Plan actuel</p>
                ) : isUpgrade ? (
                  supportLink ? (
                    <a
                      className="ui-button ui-button--primary"
                      href={createSupportLink(plan.name) ?? "#"}
                      rel="noreferrer"
                      target="_blank"
                    >
                      Demander le plan {plan.name}
                    </a>
                  ) : (
                    <button
                      className="ui-button ui-button--primary"
                      disabled
                      title="Le contact du support n’est pas configuré."
                      type="button"
                    >
                      Demander le plan {plan.name}
                    </button>
                  )
                ) : null}
              </article>
            );
          })}
        </div>
        {!supportLink ? (
          <p>
            Configure le contact du support pour activer les demandes de
            changement de plan.
          </p>
        ) : null}
      </section>

      <section className="team-section">
        <h2>Historique des factures et reçus</h2>
        <p>
          Les PDF sont privés : seuls le propriétaire de la boutique et
          l’administration peuvent y accéder.
        </p>
        <p role="note">
          Les mentions légales et fiscales des documents restent à confirmer
          avec le comptable. Les PDF portent un avertissement en attendant cette
          validation.
        </p>
        {invoiceRows.length ? (
          <ul className="grid gap-4">
            {invoiceRows.map((invoice) => (
              <li
                className="rounded-2xl border border-[var(--border-subtle)] p-4"
                key={invoice.id}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h3>
                      Facture FAC-
                      {String(invoice.invoice_number).padStart(6, "0")}
                    </h3>
                    <p>
                      <strong>{formatPrice(invoice.amount)}</strong>
                      {" · "}
                      {invoice.status === "open"
                        ? "À régler"
                        : invoice.status === "paid"
                          ? "Payée"
                          : "Annulée"}
                    </p>
                    <p>
                      Période du {formatDate(invoice.period_start)} au{" "}
                      {formatDate(invoice.period_end)}
                    </p>
                    {invoice.status === "open" ? (
                      <p>Échéance : {formatDate(invoice.due_at)}</p>
                    ) : invoice.paid_at ? (
                      <p>Payée le {formatDate(invoice.paid_at)}</p>
                    ) : null}
                  </div>
                  <InvoiceReceiptButton
                    invoiceId={invoice.id}
                    status={invoice.status}
                  />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p>Aucune facture pour le moment.</p>
        )}
        {totalInvoicePages > 1 ? (
          <nav
            aria-label="Pagination des factures"
            className="mt-4 flex items-center justify-between gap-4"
          >
            {invoicePage > 1 ? (
              <Link
                className="ui-button ui-button--secondary"
                href={`/dashboard/abonnement?shop=${encodeURIComponent(selectedShop.id)}&invoicePage=${invoicePage - 1}`}
              >
                Factures précédentes
              </Link>
            ) : (
              <span />
            )}
            <p>
              Page {invoicePage} sur {totalInvoicePages}
            </p>
            {invoicePage < totalInvoicePages ? (
              <Link
                className="ui-button ui-button--secondary"
                href={`/dashboard/abonnement?shop=${encodeURIComponent(selectedShop.id)}&invoicePage=${invoicePage + 1}`}
              >
                Factures suivantes
              </Link>
            ) : (
              <span />
            )}
          </nav>
        ) : null}
      </section>
    </main>
  );
}

function UsageMeter({
  label,
  used,
  limit,
  unit,
  detail,
}: {
  label: string;
  used: number;
  limit: number | null;
  unit: string;
  detail?: string;
}) {
  const atLimit = limit !== null && used >= limit;
  return (
    <div>
      <h3>{label}</h3>
      <p>
        {used} / {formatLimit(limit)} {unit} utilisés
      </p>
      {limit !== null ? (
        <progress
          aria-label={`Utilisation ${label.toLocaleLowerCase()}`}
          className="w-full"
          max={Math.max(limit, 1)}
          value={Math.min(used, limit)}
        />
      ) : (
        <p>Utilisation sans limite fixe.</p>
      )}
      {detail ? <p>{detail}</p> : null}
      {atLimit ? (
        <p role="status">La limite de ton plan est atteinte.</p>
      ) : null}
    </div>
  );
}

function readLimit(limits: unknown, key: string): number | null {
  if (!isRecord(limits)) {
    return null;
  }
  const value = limits[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readFeature(features: unknown, key: string) {
  return isRecord(features) && features[key] === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function formatLimit(limit: number | null) {
  return limit === null
    ? "Illimité"
    : new Intl.NumberFormat("fr-FR").format(limit);
}

function formatPrice(amount: number) {
  return `${new Intl.NumberFormat("fr-FR").format(amount)} FCFA`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "long",
    timeZone: "Africa/Ouagadougou",
  }).format(new Date(value));
}

function parsePage(value: string | undefined) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? Math.min(page, 1_000_000) : 1;
}

function createSupportLink(planName: string) {
  const message = `Bonjour, je souhaite passer au plan ${planName}.`;
  const whatsapp = process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP?.replace(/\D/g, "");
  if (whatsapp) {
    return `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}`;
  }
  const email = process.env.NEXT_PUBLIC_SUPPORT_EMAIL;
  if (email) {
    return `mailto:${email}?subject=${encodeURIComponent(
      `Demande de changement de plan`,
    )}&body=${encodeURIComponent(message)}`;
  }
  return null;
}
