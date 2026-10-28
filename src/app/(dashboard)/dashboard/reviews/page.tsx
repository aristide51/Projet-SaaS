import { MerchantReviewWorkspace } from "@/features/reviews/review-workspaces";
import { requireVerifiedUser } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export default async function MerchantReviewsPage() {
  const user = await requireVerifiedUser();
  const supabase = await createClient();
  const { data: memberships, error: membershipsError } = await supabase
    .from("shop_members")
    .select("shop_id, role, permissions")
    .eq("user_id", user.id);
  if (membershipsError) {
    throw new Error("Impossible de vérifier les droits sur les boutiques.", {
      cause: membershipsError,
    });
  }
  const shopIds = (memberships ?? [])
    .filter((member) => {
      const permissions =
        typeof member.permissions === "object" &&
        member.permissions !== null &&
        !Array.isArray(member.permissions)
          ? member.permissions
          : {};
      return member.role === "owner" || permissions.reviews === true;
    })
    .map((member) => member.shop_id);
  if (!shopIds.length) {
    return (
      <section className="team-section">
        <h1>Avis clients</h1>
        <p>Tu n’as pas de boutique avec le droit de répondre aux avis.</p>
      </section>
    );
  }
  const [
    { data: shops, error: shopsError },
    { data: rows, error: reviewsError },
  ] = await Promise.all([
    supabase.from("shops").select("id, name").in("id", shopIds),
    supabase
      .from("reviews")
      .select(
        "id, shop_id, rating, author_name, comment, shop_reply, created_at",
      )
      .in("shop_id", shopIds)
      .eq("status", "published")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (shopsError || reviewsError) {
    throw new Error("Impossible de charger les avis.", {
      cause: shopsError ?? reviewsError,
    });
  }
  const shopNames = new Map((shops ?? []).map((shop) => [shop.id, shop.name]));
  const reviews = (rows ?? []).map((review) => ({
    ...review,
    shopName: shopNames.get(review.shop_id) ?? "Boutique",
  }));
  return (
    <main className="dashboard-page">
      <header className="dashboard-page__header">
        <p className="auth-eyebrow">Relation client</p>
        <h1>Avis clients</h1>
        <p>Réponds publiquement aux avis vérifiés de tes boutiques.</p>
      </header>
      <MerchantReviewWorkspace reviews={reviews} />
    </main>
  );
}
