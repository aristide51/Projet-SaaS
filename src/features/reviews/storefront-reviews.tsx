"use client";

import Image from "next/image";
import { useState, type FormEvent } from "react";
import type { StorefrontReview } from "@/features/storefront/data";
import { reportReview } from "./actions";

type ReviewWithPhotoUrls = StorefrontReview & { photoUrls: string[] };

export function StorefrontReviews({
  reviews,
  title = "Avis vérifiés",
}: {
  reviews: ReviewWithPhotoUrls[];
  title?: string;
}) {
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  async function submit(reviewId: string, reason: string) {
    setBusyId(reviewId);
    const result = await reportReview(reviewId, reason);
    setMessages((current) => ({ ...current, [reviewId]: result.message }));
    setBusyId(null);
  }

  function submitForm(event: FormEvent<HTMLFormElement>, reviewId: string) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    void submit(reviewId, String(formData.get("reason") ?? ""));
  }

  return (
    <section aria-label={title} className="storefront-reviews">
      <div className="public-shop-section-heading">
        <div>
          <p className="auth-eyebrow">Retours des clients</p>
          <h2>{title}</h2>
        </div>
        {reviews[0] ? (
          <span>
            {reviews[0].rating_average.toFixed(1)}/5 · {reviews[0].review_count}{" "}
            avis
          </span>
        ) : null}
      </div>
      {reviews.length ? (
        <ul className="storefront-reviews__list">
          {reviews.map((review) => (
            <li className="storefront-review" key={review.id}>
              <header>
                <strong>{review.author_name ?? "Client"}</strong>
                <span aria-label={`${review.rating} sur 5`}>
                  {review.rating}/5
                </span>
                <time dateTime={review.created_at}>
                  {new Intl.DateTimeFormat("fr-FR", {
                    dateStyle: "medium",
                    timeZone: "Africa/Ouagadougou",
                  }).format(new Date(review.created_at))}
                </time>
              </header>
              {review.comment ? <p>{review.comment}</p> : null}
              {review.photo_paths.length ? (
                <ul className="storefront-review__photos">
                  {review.photoUrls.map((url) => (
                    <li key={url}>
                      <Image
                        alt="Photo jointe à l’avis"
                        height={112}
                        src={url}
                        unoptimized
                        width={112}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
              {review.shop_reply ? (
                <div className="storefront-review__reply">
                  <strong>Réponse de la boutique</strong>
                  <p>{review.shop_reply}</p>
                </div>
              ) : null}
              <details className="storefront-review__report">
                <summary>Signaler cet avis</summary>
                <form onSubmit={(event) => submitForm(event, review.id)}>
                  <label>
                    Motif du signalement
                    <textarea
                      maxLength={500}
                      minLength={5}
                      name="reason"
                      required
                      rows={2}
                    />
                  </label>
                  <button
                    className="ui-button ui-button--secondary"
                    disabled={busyId === review.id}
                  >
                    {busyId === review.id ? "Envoi…" : "Envoyer"}
                  </button>
                </form>
                {messages[review.id] ? (
                  <p role="status">{messages[review.id]}</p>
                ) : null}
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <p>Aucun avis pour le moment.</p>
      )}
    </section>
  );
}
