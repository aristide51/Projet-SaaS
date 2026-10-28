import Link from "next/link";
import { ReviewReportWorkspace } from "@/features/reviews/review-workspaces";
import { createClient } from "@/lib/supabase/server";

type Props = {
  searchParams: Promise<{ tab?: string }>;
};

const TABS = ["reported", "hidden", "history"] as const;
type ReviewTab = (typeof TABS)[number];

function isReviewTab(tab: string | undefined): tab is ReviewTab {
  return TABS.some((value) => value === tab);
}

function statusLabel(status: string) {
  if (status === "flagged") return "Signalé";
  if (status === "hidden") return "Masqué";
  return "Publié";
}

export default async function ReviewReportsPage({ searchParams }: Props) {
  const params = await searchParams;
  const tab = isReviewTab(params.tab) ? params.tab : "reported";
  const supabase = await createClient();
  const [
    { data: reports, error: reportsError },
    { data: moderatedReviews, error: moderatedError },
    { data: historyRows, error: historyError },
  ] = await Promise.all([
    supabase
      .from("review_reports")
      .select("id, review_id, reason, created_at")
      .eq("status", "open")
      .order("created_at", { ascending: true })
      .limit(100),
    supabase
      .from("reviews")
      .select("id, shop_id, author_name, rating, comment, status, created_at")
      .in("status", ["flagged", "hidden"])
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("review_moderation_history")
      .select(
        "id, review_id, actor_id, previous_status, new_status, reason, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  const queryError = reportsError ?? moderatedError ?? historyError;
  if (queryError) {
    throw new Error("Impossible de charger la file de modération.", {
      cause: queryError,
    });
  }

  const reportReviewIds = (reports ?? []).map((report) => report.review_id);
  const moderatedIds = (moderatedReviews ?? []).map((review) => review.id);
  const historyIds = (historyRows ?? []).map((entry) => entry.review_id);
  const allReviewIds = [
    ...new Set([...reportReviewIds, ...moderatedIds, ...historyIds]),
  ];
  const { data: reviews, error: reviewsError } = allReviewIds.length
    ? await supabase
        .from("reviews")
        .select("id, shop_id, author_name, rating, comment, status")
        .in("id", allReviewIds)
    : { data: [], error: null };
  if (reviewsError) {
    throw new Error("Impossible de charger les avis concernés.", {
      cause: reviewsError,
    });
  }
  const shopIds = [...new Set((reviews ?? []).map((review) => review.shop_id))];
  const actorIds = [
    ...new Set(
      (historyRows ?? []).flatMap((entry) =>
        entry.actor_id ? [entry.actor_id] : [],
      ),
    ),
  ];
  const [
    { data: shops, error: shopsError },
    { data: actors, error: actorsError },
  ] = await Promise.all([
    shopIds.length
      ? supabase.from("shops").select("id, name").in("id", shopIds)
      : Promise.resolve({ data: [], error: null }),
    actorIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", actorIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (shopsError || actorsError) {
    throw new Error("Impossible de charger les détails de modération.", {
      cause: shopsError ?? actorsError,
    });
  }

  const reviewById = new Map(
    (reviews ?? []).map((review) => [review.id, review]),
  );
  const shopById = new Map((shops ?? []).map((shop) => [shop.id, shop.name]));
  const actorById = new Map(
    (actors ?? []).map((actor) => [
      actor.id,
      actor.full_name?.trim() || "Administrateur",
    ]),
  );
  const reportsForReview = new Map(
    (reports ?? []).map((report) => [report.review_id, report]),
  );
  const reportItems = (reports ?? []).flatMap((report) => {
    const review = reviewById.get(report.review_id);
    if (!review) return [];
    return [
      {
        id: report.id,
        reviewId: review.id,
        reportId: report.id,
        reportReason: report.reason,
        reportedAt: report.created_at,
        author_name: review.author_name,
        rating: review.rating,
        comment: review.comment,
        status: review.status,
        shopName: shopById.get(review.shop_id) ?? "Boutique",
      },
    ];
  });
  const moderatedItems = (moderatedReviews ?? []).map((review) => {
    const report = reportsForReview.get(review.id);
    return {
      id: review.id,
      reviewId: review.id,
      author_name: review.author_name,
      rating: review.rating,
      comment: review.comment,
      status: review.status,
      ...(report
        ? {
            reportReason: report.reason,
            reportedAt: report.created_at,
          }
        : {}),
      shopName: shopById.get(review.shop_id) ?? "Boutique",
    };
  });
  const history = (historyRows ?? []).flatMap((entry) => {
    const review = reviewById.get(entry.review_id);
    if (!review) return [];
    return [
      {
        id: entry.id,
        reviewId: entry.review_id,
        previousStatus: statusLabel(entry.previous_status),
        newStatus: statusLabel(entry.new_status),
        reason: entry.reason,
        actorName: entry.actor_id
          ? (actorById.get(entry.actor_id) ?? "Administrateur")
          : "Compte supprimé",
        createdAt: entry.created_at,
        shopName: shopById.get(review.shop_id) ?? "Boutique",
        authorName: review.author_name,
        rating: review.rating,
        comment: review.comment,
      },
    ];
  });

  return (
    <main className="dashboard-page">
      <header className="dashboard-page__header">
        <p className="auth-eyebrow">Modération</p>
        <h1>File de modération des avis</h1>
        <p>
          Examine les signalements, rétablis les avis masqués et consulte chaque
          décision enregistrée.
        </p>
      </header>
      <nav
        aria-label="Sections de modération"
        className="review-moderation-tabs"
      >
        <Link
          aria-current={tab === "reported" ? "page" : undefined}
          href="/admin/review-reports?tab=reported"
        >
          Signalés ({reportItems.length})
        </Link>
        <Link
          aria-current={tab === "hidden" ? "page" : undefined}
          href="/admin/review-reports?tab=hidden"
        >
          Masqués ({moderatedItems.length})
        </Link>
        <Link
          aria-current={tab === "history" ? "page" : undefined}
          href="/admin/review-reports?tab=history"
        >
          Historique
        </Link>
      </nav>
      <ReviewReportWorkspace
        history={history}
        moderated={moderatedItems}
        reports={reportItems}
        tab={tab}
      />
    </main>
  );
}
