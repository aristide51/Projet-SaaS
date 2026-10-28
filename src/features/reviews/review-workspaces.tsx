"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  moderateReview,
  replyToReview,
  resolveReviewReport,
  type ReviewActionResult,
} from "./actions";

type ReplyReview = {
  id: string;
  shop_id: string;
  shopName: string;
  rating: number;
  author_name: string | null;
  comment: string | null;
  shop_reply: string | null;
  created_at: string;
};

export function MerchantReviewWorkspace({
  reviews,
}: {
  reviews: ReplyReview[];
}) {
  const router = useRouter();
  const [results, setResults] = useState<Record<string, ReviewActionResult>>(
    {},
  );
  const [busy, setBusy] = useState<string | null>(null);

  async function submit(
    event: FormEvent<HTMLFormElement>,
    review: ReplyReview,
  ) {
    event.preventDefault();
    setBusy(review.id);
    const formData = new FormData(event.currentTarget);
    const result = await replyToReview(
      review.id,
      review.shop_id,
      String(formData.get("reply") ?? ""),
    );
    setResults((current) => ({ ...current, [review.id]: result }));
    setBusy(null);
    if (result.success) router.refresh();
  }

  return reviews.length ? (
    <ul className="merchant-review-list">
      {reviews.map((review) => {
        const result = results[review.id];
        return (
          <li className="merchant-review-card" key={review.id}>
            <header>
              <div>
                <p className="auth-eyebrow">{review.shopName}</p>
                <strong>
                  {review.author_name ?? "Client"} · {review.rating}/5
                </strong>
              </div>
              <time dateTime={review.created_at}>
                {new Intl.DateTimeFormat("fr-FR", {
                  dateStyle: "medium",
                  timeZone: "Africa/Ouagadougou",
                }).format(new Date(review.created_at))}
              </time>
            </header>
            {review.comment ? (
              <p>{review.comment}</p>
            ) : (
              <p>Aucun commentaire écrit.</p>
            )}
            <form onSubmit={(event) => void submit(event, review)}>
              <label>
                Réponse publique
                <textarea
                  defaultValue={review.shop_reply ?? ""}
                  maxLength={1000}
                  name="reply"
                  required
                  rows={3}
                />
              </label>
              {result ? (
                <p
                  className={`ui-message ui-message--${result.success ? "success" : "error"}`}
                  role={result.success ? "status" : "alert"}
                >
                  {result.message}
                </p>
              ) : null}
              <button
                className="ui-button ui-button--secondary"
                disabled={busy === review.id}
              >
                {busy === review.id ? "Enregistrement…" : "Publier la réponse"}
              </button>
            </form>
          </li>
        );
      })}
    </ul>
  ) : (
    <p>Aucun avis publié pour le moment.</p>
  );
}

type ReviewQueueItem = {
  id: string;
  reviewId: string;
  reportId?: string;
  reportReason?: string;
  reportedAt?: string;
  author_name: string | null;
  rating: number;
  comment: string | null;
  status: "published" | "hidden" | "flagged";
  shopName: string;
};

type ModerationEntry = {
  id: string;
  reviewId: string;
  previousStatus: string;
  newStatus: string;
  reason: string | null;
  actorName: string;
  createdAt: string;
  shopName: string;
  authorName: string | null;
  rating: number;
  comment: string | null;
};

export function ReviewReportWorkspace({
  tab,
  reports,
  moderated,
  history,
}: {
  tab: "reported" | "hidden" | "history";
  reports: ReviewQueueItem[];
  moderated: ReviewQueueItem[];
  history: ModerationEntry[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function moderate(
    review: ReviewQueueItem,
    status: "published" | "hidden",
    reason: string,
  ) {
    setBusy(review.id);
    const result = await moderateReview(
      review.reviewId,
      status,
      reason,
      review.reportId,
    );
    setMessages((current) => ({ ...current, [review.id]: result.message }));
    setBusy(null);
    if (result.success) router.refresh();
  }

  async function dismissReport(report: ReviewQueueItem) {
    if (!report.reportId) return;
    setBusy(report.id);
    const result = await resolveReviewReport(report.reportId, "dismissed");
    setMessages((current) => ({ ...current, [report.id]: result.message }));
    setBusy(null);
    if (result.success) router.refresh();
  }

  if (tab === "history") {
    return history.length ? (
      <ol className="review-moderation-history">
        {history.map((entry) => (
          <li className="merchant-review-card" key={entry.id}>
            <header>
              <div>
                <p className="auth-eyebrow">{entry.shopName}</p>
                <strong>
                  {entry.authorName ?? "Client"} · {entry.rating}/5
                </strong>
              </div>
              <time dateTime={entry.createdAt}>
                {new Intl.DateTimeFormat("fr-FR", {
                  dateStyle: "medium",
                  timeStyle: "short",
                  timeZone: "Africa/Ouagadougou",
                }).format(new Date(entry.createdAt))}
              </time>
            </header>
            <p>
              Statut : {reviewStatusLabel(entry.previousStatus)} →{" "}
              {reviewStatusLabel(entry.newStatus)} · {entry.actorName}
            </p>
            {entry.reason ? <p>Motif : {entry.reason}</p> : null}
            {entry.comment ? <blockquote>{entry.comment}</blockquote> : null}
          </li>
        ))}
      </ol>
    ) : (
      <p>Aucune décision de modération enregistrée.</p>
    );
  }

  const queue = tab === "reported" ? reports : moderated;
  const emptyMessage =
    tab === "reported"
      ? "Aucun signalement en attente."
      : "Aucun avis masqué ou signalé.";
  return queue.length ? (
    <ul className="merchant-review-list">
      {queue.map((review) => {
        const message = messages[review.id];
        return (
          <li className="merchant-review-card" key={review.id}>
            <header>
              <div>
                <p className="auth-eyebrow">{review.shopName}</p>
                <strong>
                  {review.author_name ?? "Client"} · {review.rating}/5
                </strong>
              </div>
              <span className="ui-badge">
                {reviewStatusLabel(review.status)}
              </span>
            </header>
            <p>{review.comment ?? "Aucun commentaire."}</p>
            {review.reportReason ? (
              <p>
                <strong>Motif du signalement :</strong> {review.reportReason}
              </p>
            ) : null}
            {review.reportedAt ? (
              <time dateTime={review.reportedAt}>
                Signalé le{" "}
                {new Intl.DateTimeFormat("fr-FR", {
                  dateStyle: "medium",
                  timeZone: "Africa/Ouagadougou",
                }).format(new Date(review.reportedAt))}
              </time>
            ) : null}
            {message ? (
              <p className="ui-message ui-message--error" role="alert">
                {message}
              </p>
            ) : null}
            {tab === "reported" ? (
              <div className="promotion-form__actions">
                <button
                  className="ui-button ui-button--primary"
                  disabled={busy === review.id || review.status === "hidden"}
                  onClick={() =>
                    void moderate(
                      review,
                      "hidden",
                      review.reportReason ?? "Avis signalé",
                    )
                  }
                  type="button"
                >
                  {busy === review.id ? "Traitement…" : "Masquer et clôturer"}
                </button>
                <button
                  className="ui-button ui-button--secondary"
                  disabled={busy === review.id}
                  onClick={() => void dismissReport(review)}
                  type="button"
                >
                  Classer sans suite
                </button>
              </div>
            ) : (
              <button
                className="ui-button ui-button--secondary"
                disabled={busy === review.id}
                onClick={() =>
                  void moderate(
                    review,
                    "published",
                    "Avis rétabli après modération",
                  )
                }
                type="button"
              >
                {busy === review.id ? "Traitement…" : "Rendre visible"}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  ) : (
    <p>{emptyMessage}</p>
  );
}

function reviewStatusLabel(status: string) {
  switch (status) {
    case "published":
      return "Publié";
    case "hidden":
      return "Masqué";
    case "flagged":
      return "Signalé";
    default:
      return status;
  }
}
