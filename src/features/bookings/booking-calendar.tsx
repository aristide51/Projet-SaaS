"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { setMerchantBookingStatus } from "./actions";

export type BookingAgendaEntry = {
  id: string;
  customer_name: string | null;
  customer_phone: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  service_name: string;
  resource_id: string;
  resource_name: string;
};

type Props = {
  shopId: string;
  bookings: BookingAgendaEntry[];
  resources: { id: string; name: string }[];
};

const statusLabels: Record<string, string> = {
  pending: "À confirmer",
  confirmed: "Confirmé",
  cancelled: "Annulé",
  completed: "Terminé",
  no_show: "Absent",
};

function toLocalDate(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeZone: "Africa/Ouagadougou",
  }).format(date);
}

function toLocalTime(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Ouagadougou",
  }).format(new Date(value));
}

function dayKey(value: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Ouagadougou",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function shiftDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekStart(value: string) {
  const date = new Date(`${value}T12:00:00Z`);
  const weekday = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - weekday);
  return date.toISOString().slice(0, 10);
}

export function BookingCalendar({ shopId, bookings, resources }: Props) {
  const router = useRouter();
  const [view, setView] = useState<"day" | "week">("week");
  const [date, setDate] = useState(() => dayKey(new Date().toISOString()));
  const [resourceId, setResourceId] = useState("all");
  const [message, setMessage] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`shop-bookings:${shopId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
          filter: `shop_id=eq.${shopId}`,
        },
        () => router.refresh(),
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setMessage(
            "La mise à jour en temps réel est indisponible. Recharge la page pour actualiser l’agenda.",
          );
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router, shopId]);

  const visibleBookings = useMemo(() => {
    const start = view === "day" ? date : weekStart(date);
    const end = shiftDate(start, view === "day" ? 1 : 7);
    return bookings
      .filter((booking) => {
        const key = dayKey(booking.starts_at);
        return (
          key >= start &&
          key < end &&
          (resourceId === "all" || booking.resource_id === resourceId)
        );
      })
      .sort((left, right) =>
        left.starts_at.localeCompare(right.starts_at),
      );
  }, [bookings, date, resourceId, view]);

  async function changeStatus(
    booking: BookingAgendaEntry,
    status: "confirmed" | "cancelled" | "completed" | "no_show",
  ) {
    const reason =
      status === "cancelled"
        ? window.prompt("Motif obligatoire de l’annulation :")?.trim()
        : "";
    if (status === "cancelled" && !reason) return;

    setPendingId(booking.id);
    setMessage("");
    try {
      const result = await setMerchantBookingStatus(
        shopId,
        booking.id,
        status,
        reason ?? "",
      );
      if (!result.success) {
        setMessage(result.message);
        return;
      }
      setMessage("Le rendez-vous a été mis à jour.");
      router.refresh();
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="booking-calendar" aria-labelledby="booking-calendar-title">
      <header className="booking-calendar__header">
        <div>
          <p className="eyebrow">Agenda</p>
          <h2 id="booking-calendar-title">Rendez-vous</h2>
        </div>
        <div className="booking-calendar__controls">
          <label>
            <span>Affichage</span>
            <select
              value={view}
              onChange={(event) =>
                setView(event.target.value === "day" ? "day" : "week")
              }
            >
              <option value="day">Jour</option>
              <option value="week">Semaine</option>
            </select>
          </label>
          <label>
            <span>Date</span>
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </label>
          <label>
            <span>Ressource</span>
            <select
              value={resourceId}
              onChange={(event) => setResourceId(event.target.value)}
            >
              <option value="all">Toutes</option>
              {resources.map((resource) => (
                <option key={resource.id} value={resource.id}>
                  {resource.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {message ? (
        <p className="booking-calendar__message" role="status">
          {message}
        </p>
      ) : null}
      {visibleBookings.length ? (
        <ul className="booking-calendar__list">
          {visibleBookings.map((booking) => (
            <li
              className={`booking-calendar__card booking-calendar__card--${booking.status}`}
              key={booking.id}
            >
              <div className="booking-calendar__time">
                <strong>{toLocalTime(booking.starts_at)}</strong>
                <span>{toLocalTime(booking.ends_at)}</span>
                <span>{toLocalDate(booking.starts_at)}</span>
              </div>
              <div className="booking-calendar__details">
                <div className="booking-calendar__title">
                  <h3>{booking.service_name}</h3>
                  <span className="booking-calendar__status">
                    {statusLabels[booking.status] ?? booking.status}
                  </span>
                </div>
                <p>
                  {booking.customer_name || "Client"}
                  {" · "}
                  {booking.resource_name}
                </p>
                {booking.customer_phone ? (
                  <a
                    href={`https://wa.me/${booking.customer_phone.replace(/\D/g, "")}`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    WhatsApp · {booking.customer_phone}
                  </a>
                ) : (
                  <span>Téléphone non renseigné</span>
                )}
              </div>
              {booking.status === "pending" ||
              booking.status === "confirmed" ? (
                <div className="booking-calendar__actions">
                  {booking.status === "pending" ? (
                    <button
                      className="ui-button ui-button--secondary"
                      disabled={pendingId === booking.id}
                      onClick={() => void changeStatus(booking, "confirmed")}
                      type="button"
                    >
                      Confirmer
                    </button>
                  ) : null}
                  {booking.status === "confirmed" ? (
                    <>
                      <button
                        className="ui-button ui-button--secondary"
                        disabled={pendingId === booking.id}
                        onClick={() => void changeStatus(booking, "completed")}
                        type="button"
                      >
                        Terminé
                      </button>
                      <button
                        className="ui-button ui-button--secondary"
                        disabled={pendingId === booking.id}
                        onClick={() => void changeStatus(booking, "no_show")}
                        type="button"
                      >
                        Absent
                      </button>
                    </>
                  ) : null}
                  <button
                    className="ui-button ui-button--danger"
                    disabled={pendingId === booking.id}
                    onClick={() => void changeStatus(booking, "cancelled")}
                    type="button"
                  >
                    Annuler
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="booking-calendar__empty">
          Aucun rendez-vous sur cette période.
        </p>
      )}
    </section>
  );
}
