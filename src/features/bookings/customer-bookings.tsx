"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { cancelCustomerBooking } from "./customer-actions";
import type { Database } from "@/types/database";
import { ReviewForm } from "@/features/reviews/review-form";
import { savePrivateSnapshot } from "@/lib/pwa/private-data";
import { useOfflineStatus } from "@/lib/pwa/use-offline-status";

type BookingStatus = Database["public"]["Enums"]["booking_status"];

export type CustomerBookingView = {
  id: string;
  shopId: string;
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
  note: string | null;
  cancelledReason: string | null;
  shopName: string;
  shopSlug: string;
  serviceName: string;
  resourceName: string;
  reviewed: boolean;
};

type Props = {
  bookings: CustomerBookingView[];
  now: string;
  userId: string;
};

const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: "En attente de confirmation",
  confirmed: "Confirmé",
  cancelled: "Annulé",
  completed: "Terminé",
  no_show: "Absence constatée",
};

function formatBookingDate(dateTime: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Africa/Ouagadougou",
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(dateTime));
}

export function CustomerBookings({ bookings, now, userId }: Props) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const isOffline = useOfflineStatus();
  const [offlineStorageError, setOfflineStorageError] = useState(false);
  const [notice, setNotice] = useState<{
    bookingId: string;
    kind: "success" | "error";
    message: string;
  } | null>(null);

  useEffect(() => {
    let active = true;
    let wasOffline = !navigator.onLine;
    const handleOnline = () => {
      if (wasOffline) {
        wasOffline = false;
        router.refresh();
      }
    };
    const handleOffline = () => {
      wasOffline = true;
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    void savePrivateSnapshot(
      userId,
      "bookings",
      bookings.map(
        ({
          status,
          startsAt,
          endsAt,
          shopName,
          serviceName,
          resourceName,
        }) => ({
          status,
          startsAt,
          endsAt,
          shopName,
          serviceName,
          resourceName,
        }),
      ),
    ).catch(() => {
      if (active) setOfflineStorageError(true);
    });

    return () => {
      active = false;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [bookings, router, userId]);

  async function cancel(bookingId: string) {
    setPendingId(bookingId);
    setNotice(null);
    try {
      const result = await cancelCustomerBooking(bookingId);
      if (!result.success) {
        setNotice({
          bookingId,
          kind: "error",
          message: result.message,
        });
        return;
      }

      setNotice({
        bookingId,
        kind: "success",
        message: "Le rendez-vous a été annulé.",
      });
      router.refresh();
    } catch {
      setNotice({
        bookingId,
        kind: "error",
        message:
          "L’annulation n’a pas abouti. Vérifie ta connexion puis réessaie.",
      });
    } finally {
      setPendingId(null);
    }
  }

  if (bookings.length === 0 && !isOffline) {
    return (
      <section
        aria-labelledby="customer-bookings-title"
        className="team-section"
      >
        <h2 id="customer-bookings-title">Mes rendez-vous</h2>
        <p>Tu n’as pas encore de rendez-vous.</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="customer-bookings-title" className="team-section">
      <h2 id="customer-bookings-title">Mes rendez-vous</h2>
      {isOffline ? (
        <p className="ui-message" role="status">
          Hors connexion : consultation uniquement. Annulation et avis sont
          désactivés jusqu’au retour du réseau.
        </p>
      ) : null}
      {offlineStorageError ? (
        <p className="ui-message ui-message--error" role="status">
          Les rendez-vous ne pourront pas être consultés hors connexion sur cet
          appareil.
        </p>
      ) : null}
      {bookings.length === 0 ? <p>Tu n’as pas encore de rendez-vous.</p> : null}
      <ul className="customer-booking-list">
        {bookings.map((booking) => {
          const canCancel =
            (booking.status === "pending" || booking.status === "confirmed") &&
            Date.parse(booking.startsAt) > Date.parse(now);
          const bookingNotice =
            notice?.bookingId === booking.id ? notice : null;

          return (
            <li className="customer-booking-card" key={booking.id}>
              <div className="customer-booking-card__header">
                <div>
                  <p className="auth-eyebrow">{booking.shopName}</p>
                  <h3>{booking.serviceName}</h3>
                </div>
                <span className="ui-badge">
                  {STATUS_LABELS[booking.status]}
                </span>
              </div>
              <dl>
                <div>
                  <dt>Date et heure</dt>
                  <dd>
                    <time dateTime={booking.startsAt}>
                      {formatBookingDate(booking.startsAt)}
                    </time>
                    {" – "}
                    <time dateTime={booking.endsAt}>
                      {formatBookingDate(booking.endsAt)}
                    </time>
                  </dd>
                </div>
                <div>
                  <dt>Ressource</dt>
                  <dd>{booking.resourceName}</dd>
                </div>
                {booking.note ? (
                  <div>
                    <dt>Ta note</dt>
                    <dd>{booking.note}</dd>
                  </div>
                ) : null}
                {booking.status === "cancelled" && booking.cancelledReason ? (
                  <div>
                    <dt>Motif</dt>
                    <dd>{booking.cancelledReason}</dd>
                  </div>
                ) : null}
              </dl>
              {bookingNotice ? (
                <p
                  className={`ui-message ui-message--${bookingNotice.kind}`}
                  role={bookingNotice.kind === "error" ? "alert" : "status"}
                >
                  {bookingNotice.message}
                </p>
              ) : null}
              {booking.status === "completed" ? (
                booking.reviewed ? (
                  <p className="ui-message ui-message--success">
                    Merci, tu as déjà évalué ce rendez-vous.
                  </p>
                ) : isOffline ? (
                  <p className="ui-message">
                    La publication d’un avis nécessite une connexion.
                  </p>
                ) : (
                  <ReviewForm bookingId={booking.id} shopId={booking.shopId} />
                )
              ) : null}
              <div className="customer-booking-card__actions">
                <Link
                  className="ui-button ui-button--secondary"
                  href={`/${encodeURIComponent(booking.shopSlug)}`}
                >
                  Voir la boutique
                </Link>
                {canCancel ? (
                  <button
                    className="ui-button ui-button--secondary"
                    disabled={pendingId === booking.id || isOffline}
                    onClick={() => void cancel(booking.id)}
                    type="button"
                  >
                    {pendingId === booking.id ? "Annulation…" : "Annuler"}
                  </button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
