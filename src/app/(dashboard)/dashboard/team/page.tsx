import Link from "next/link";
import { TeamWorkspace } from "@/features/team/team-workspace";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

type TeamPageProps = {
  searchParams: Promise<{ shop?: string }>;
};

export default async function TeamPage({ searchParams }: TeamPageProps) {
  const user = await requireVerifiedUser();
  const params = await searchParams;
  const supabase = await createClient();
  const { data: memberships, error: membershipError } = await supabase
    .from("shop_members")
    .select("shop_id")
    .eq("user_id", user.id)
    .eq("role", "owner");

  if (membershipError) {
    throw new Error("Impossible de charger les boutiques de l’équipe.", {
      cause: membershipError,
    });
  }

  const shopIds = (memberships ?? []).map((membership) => membership.shop_id);
  if (!shopIds.length) {
    return (
      <main className="team-shell">
        <section className="team-section" role="alert">
          <h1>Gestion réservée au propriétaire</h1>
          <p>
            Seul le propriétaire d’une boutique peut inviter des employés et
            gérer leurs permissions.
          </p>
          <Link className="ui-button ui-button--secondary" href="/dashboard">
            Retour au tableau de bord
          </Link>
        </section>
      </main>
    );
  }

  const { data: shops, error: shopsError } = await supabase
    .from("shops")
    .select("id, name")
    .in("id", shopIds)
    .order("created_at", { ascending: false });
  if (shopsError) {
    throw new Error("Impossible de charger les boutiques.", {
      cause: shopsError,
    });
  }

  const selectedShop = params.shop
    ? shops?.find((shop) => shop.id === params.shop)
    : shops?.[0];
  if (!selectedShop) {
    return (
      <main className="team-shell">
        <section className="team-section" role="alert">
          <h1>Boutique introuvable</h1>
          <p>Tu n’es pas propriétaire de cette boutique.</p>
        </section>
      </main>
    );
  }

  const [teamResult, invitationsResult, limitResult] = await Promise.all([
    supabase.rpc("list_shop_team", { p_shop: selectedShop.id }),
    supabase.rpc("list_shop_invitations", { p_shop: selectedShop.id }),
    supabase.rpc("shop_staff_limit", { p_shop: selectedShop.id }),
  ]);
  for (const result of [teamResult, invitationsResult, limitResult]) {
    if (result.error) {
      throw new Error("Impossible de charger les données de l’équipe.", {
        cause: result.error,
      });
    }
  }

  return (
    <TeamWorkspace
      invitations={invitationsResult.data ?? []}
      maxStaff={limitResult.data}
      members={teamResult.data ?? []}
      shopId={selectedShop.id}
      shops={shops ?? []}
    />
  );
}
