import Link from "next/link";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { MarketingMotion } from "@/components/design/marketing-motion";

type DashboardShortcut = {
  href: string;
  icon: string;
  label: string;
  description: string;
};

function can(
  member: {
    role: string;
    permissions: unknown;
  },
  permission: string,
) {
  if (member.role === "owner") return true;
  const permissions = member.permissions;
  return (
    typeof permissions === "object" &&
    permissions !== null &&
    !Array.isArray(permissions) &&
    (permissions as Record<string, unknown>)[permission] === true
  );
}

export default async function DashboardPage() {
  const user = await requireVerifiedUser();
  const supabase = await createClient();
  const { data: memberships, error: membershipsError } = await supabase
    .from("shop_members")
    .select("shop_id, role, permissions")
    .eq("user_id", user.id);

  if (membershipsError) {
    throw new Error("Impossible de charger tes boutiques.", {
      cause: membershipsError,
    });
  }

  const shopIds = [
    ...new Set((memberships ?? []).map((member) => member.shop_id)),
  ];
  const [shopsResult, pendingOrdersResult, pendingBookingsResult] =
    shopIds.length
      ? await Promise.all([
          supabase
            .from("shops")
            .select("id, name, slug")
            .in("id", shopIds)
            .order("created_at", { ascending: false }),
          supabase
            .from("orders")
            .select("id", { count: "exact", head: true })
            .in("shop_id", shopIds)
            .in("status", ["pending_payment", "payment_declared"]),
          supabase
            .from("bookings")
            .select("id", { count: "exact", head: true })
            .in("shop_id", shopIds)
            .eq("status", "pending"),
        ])
      : [
          { data: [], error: null },
          { count: 0, error: null },
          { count: 0, error: null },
        ];

  const loadError =
    shopsResult.error ??
    pendingOrdersResult.error ??
    pendingBookingsResult.error;
  if (loadError) {
    throw new Error(
      "Impossible de charger les indicateurs du tableau de bord.",
      {
        cause: loadError,
      },
    );
  }

  const shops = shopsResult.data ?? [];
  const primaryShop = shops[0];
  const primaryMembership = memberships?.find(
    (member) => member.shop_id === primaryShop?.id,
  );
  const shortcuts: DashboardShortcut[] = [];
  const routes = [
    {
      permission: "catalog",
      href: "/dashboard/catalog",
      icon: "▦",
      label: "Catalogue",
      description: "Gérer les produits et services",
    },
    {
      permission: "orders",
      href: "/dashboard/orders",
      icon: "↗",
      label: "Commandes",
      description: "Suivre les demandes clients",
    },
    {
      permission: "bookings",
      href: "/dashboard/bookings",
      icon: "◷",
      label: "Rendez-vous",
      description: "Consulter l’agenda de la boutique",
    },
    {
      permission: "payments",
      href: `/dashboard/payments${primaryShop ? `?shop=${encodeURIComponent(primaryShop.id)}` : ""}`,
      icon: "◉",
      label: "Paiements",
      description: "Configurer le paiement mobile money",
    },
    {
      permission: "promotions",
      href: `/dashboard/promotions${primaryShop ? `?shop=${encodeURIComponent(primaryShop.id)}` : ""}`,
      icon: "%",
      label: "Promotions",
      description: "Créer une offre pour les clients",
    },
    {
      permission: "reviews",
      href: "/dashboard/reviews",
      icon: "☆",
      label: "Avis clients",
      description: "Lire et gérer les avis reçus",
    },
  ];

  if (primaryMembership && primaryShop) {
    shortcuts.push(
      ...routes.filter((route) => can(primaryMembership, route.permission)),
    );
    if (primaryMembership.role === "owner") {
      shortcuts.push({
        href: `/dashboard/team?shop=${encodeURIComponent(primaryShop.id)}`,
        icon: "◎",
        label: "Mon équipe",
        description: "Inviter et gérer les accès",
      });
    }
    shortcuts.push({
      href: `/dashboard/abonnement?shop=${encodeURIComponent(primaryShop.id)}`,
      icon: "◇",
      label: "Abonnement",
      description: "Consulter le plan et les factures",
    });
  }

  return (
    <MarketingMotion>
      <main className="dashboard-page merchant-home">
        <header className="merchant-home__hero" data-reveal>
          <div>
            <p className="auth-eyebrow">Espace commerçant</p>
            <h1>
              Bonjour,{" "}
              {user.user_metadata?.full_name?.split(" ")[0] ?? "bienvenue"}.
            </h1>
            <p>
              {primaryShop
                ? `Retrouve ici l’activité de ${primaryShop.name} et les outils de gestion.`
                : "Crée ta première boutique et prépare ta vitrine en ligne."}
            </p>
          </div>
          <Link
            className="ui-button ui-button--primary"
            href="/dashboard/onboarding"
          >
            {primaryShop ? "Modifier ma boutique" : "Créer ma boutique"}
            <span aria-hidden="true">→</span>
          </Link>
        </header>

        {shops.length > 1 ? (
          <p className="merchant-home__shop-count">
            {shops.length} boutiques liées à ton compte
          </p>
        ) : null}

        {primaryShop ? (
          <section
            aria-label="Activité à suivre"
            className="merchant-home__stats"
            data-stagger
          >
            <article className="merchant-stat">
              <span aria-hidden="true" className="merchant-stat__icon">
                ↗
              </span>
              <p className="merchant-stat__value">
                {pendingOrdersResult.count ?? 0}
              </p>
              <h2>Commandes à traiter</h2>
              <Link href="/dashboard/orders">
                Ouvrir les commandes <span aria-hidden="true">→</span>
              </Link>
            </article>
            <article className="merchant-stat">
              <span aria-hidden="true" className="merchant-stat__icon">
                ◷
              </span>
              <p className="merchant-stat__value">
                {pendingBookingsResult.count ?? 0}
              </p>
              <h2>Demandes de rendez-vous</h2>
              <Link href="/dashboard/bookings">
                Ouvrir l’agenda <span aria-hidden="true">→</span>
              </Link>
            </article>
            <article className="merchant-stat merchant-stat--shop">
              <span aria-hidden="true" className="merchant-stat__icon">
                ▦
              </span>
              <p className="merchant-stat__value">{shops.length}</p>
              <h2>{shops.length > 1 ? "Boutiques" : "Ma boutique"}</h2>
              <Link
                href={`/${encodeURIComponent(primaryShop.slug)}`}
                target="_blank"
                rel="noreferrer"
              >
                Voir la vitrine <span aria-hidden="true">↗</span>
              </Link>
            </article>
          </section>
        ) : (
          <section className="merchant-home__empty" data-reveal>
            <span aria-hidden="true">✳</span>
            <div>
              <h2>Ta boutique commence ici.</h2>
              <p>
                Ajoute les informations de ton commerce, puis partage ta vitrine
                avec tes clients.
              </p>
            </div>
            <Link
              className="ui-button ui-button--secondary"
              href="/dashboard/onboarding"
            >
              Commencer la mise en route
            </Link>
          </section>
        )}

        <section
          aria-labelledby="merchant-tools-title"
          className="merchant-home__tools"
        >
          <div className="merchant-home__section-heading" data-reveal>
            <div>
              <p className="auth-eyebrow">Tes outils</p>
              <h2 id="merchant-tools-title">Gère ton activité simplement.</h2>
            </div>
            <p>
              Les raccourcis affichés dépendent des droits associés à ton
              compte.
            </p>
          </div>
          {shortcuts.length ? (
            <div className="merchant-tools-grid" data-stagger>
              {shortcuts.map((shortcut) => (
                <Link
                  className="merchant-tool"
                  href={shortcut.href}
                  key={shortcut.label}
                >
                  <span aria-hidden="true" className="merchant-tool__icon">
                    {shortcut.icon}
                  </span>
                  <span className="merchant-tool__body">
                    <strong>{shortcut.label}</strong>
                    <span>{shortcut.description}</span>
                  </span>
                  <span aria-hidden="true" className="merchant-tool__arrow">
                    ↗
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="merchant-home__empty merchant-home__empty--compact">
              <p>
                Les espaces de gestion apparaîtront dès que tu auras accès à une
                boutique.
              </p>
            </div>
          )}
        </section>

        {shops.length > 1 ? (
          <section
            aria-labelledby="merchant-shops-title"
            className="merchant-home__shops"
            data-reveal
          >
            <div className="merchant-home__section-heading">
              <div>
                <p className="auth-eyebrow">Tes espaces</p>
                <h2 id="merchant-shops-title">Tes boutiques</h2>
              </div>
            </div>
            <ul>
              {shops.map((shop) => (
                <li key={shop.id}>
                  <span>{shop.name}</span>
                  <Link
                    href={`/${encodeURIComponent(shop.slug)}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ouvrir la vitrine <span aria-hidden="true">↗</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </MarketingMotion>
  );
}
