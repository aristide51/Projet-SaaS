"use client";

import { useEffect, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getMyNotifications,
  markNotificationAsRead,
  type AppNotification,
  type NotificationPage,
} from "./actions";

export function NotificationCenterClient({
  userId,
  initialPage,
}: {
  userId: string;
  initialPage: NotificationPage;
}) {
  const [page, setPage] = useState(initialPage);
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [loadingMore, startLoadingMore] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`user-notifications:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void getMyNotifications(0)
            .then(setPage)
            .catch(() =>
              setMessage("Les notifications n’ont pas pu être actualisées."),
            );
        },
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          setMessage(
            "La mise à jour en temps réel est indisponible. Recharge la page pour actualiser.",
          );
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  async function markAsRead(notification: AppNotification) {
    if (notification.read_at || pendingId) return;

    setPendingId(notification.id);
    setMessage("");
    const result = await markNotificationAsRead(notification.id);
    if (!result.success) {
      setMessage(result.message);
      setPendingId(null);
      return;
    }

    const readAt = new Date().toISOString();
    setPage((current) => ({
      ...current,
      items: current.items.map((item) =>
        item.id === notification.id ? { ...item, read_at: readAt } : item,
      ),
      unreadCount: Math.max(0, current.unreadCount - 1),
    }));
    setPendingId(null);
  }

  function loadMore() {
    if (loadingMore || !page.hasMore) return;

    startLoadingMore(async () => {
      try {
        const next = await getMyNotifications(page.items.length);
        setPage((current) => ({
          items: [...current.items, ...next.items],
          unreadCount: next.unreadCount,
          hasMore: next.hasMore,
        }));
      } catch {
        setMessage("Les notifications suivantes n’ont pas pu être chargées.");
      }
    });
  }

  return (
    <section className="notification-center">
      <button
        aria-controls="notification-list"
        aria-expanded={isOpen}
        aria-label={
          page.unreadCount
            ? `Notifications, ${page.unreadCount} non lue(s)`
            : "Notifications"
        }
        className="notification-toggle"
        onClick={() => setIsOpen((open) => !open)}
        type="button"
      >
        <svg
          aria-hidden="true"
          fill="none"
          height="20"
          viewBox="0 0 24 24"
          width="20"
        >
          <path
            d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
        <span>Notifications</span>
        {page.unreadCount > 0 ? (
          <span
            aria-label={`${page.unreadCount} non lue(s)`}
            className="notification-count"
          >
            {page.unreadCount > 99 ? "99+" : page.unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div
          aria-label="Centre de notifications"
          className="notification-panel"
          id="notification-list"
          role="region"
        >
          <header className="notification-panel__header">
            <h2>Notifications</h2>
            <span>{page.unreadCount} non lue(s)</span>
          </header>
          {page.items.length ? (
            <ul className="notification-list">
              {page.items.map((notification) => (
                <li key={notification.id}>
                  <button
                    aria-label={`${notification.read_at ? "Lue" : "Non lue"} : ${notificationText(notification)}`}
                    className={`notification-item ${notification.read_at ? "is-read" : "is-unread"}`}
                    disabled={
                      Boolean(notification.read_at) ||
                      pendingId === notification.id
                    }
                    onClick={() => void markAsRead(notification)}
                    type="button"
                  >
                    <strong>{notificationTitle(notification.type)}</strong>
                    <span>{notificationText(notification)}</span>
                    <time dateTime={notification.created_at}>
                      {new Intl.DateTimeFormat("fr-FR", {
                        dateStyle: "short",
                        timeStyle: "short",
                        timeZone: "Africa/Ouagadougou",
                      }).format(new Date(notification.created_at))}
                    </time>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="notification-empty">
              Tu n’as pas encore de notification.
            </p>
          )}
          {page.hasMore ? (
            <button
              className="notification-load-more"
              disabled={loadingMore}
              onClick={loadMore}
              type="button"
            >
              {loadingMore ? "Chargement…" : "Afficher les plus anciennes"}
            </button>
          ) : null}
          {message ? (
            <p className="notification-message" role="status">
              {message}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function notificationTitle(type: string) {
  const titles: Record<string, string> = {
    order_status: "Mise à jour de commande",
    order_received: "Commande reçue",
    order_cancellation_request: "Demande d’annulation",
    shop_review: "Décision sur ta boutique",
  };
  return titles[type] ?? "Nouvelle notification";
}

function notificationText(notification: AppNotification) {
  if (notification.type === "order_received") {
    const code = jsonString(notification.payload, "code");
    return code
      ? `La commande ${code} a bien été reçue par la boutique.`
      : "La boutique a bien reçu ta commande.";
  }

  if (notification.type === "order_status") {
    const status = jsonString(notification.payload, "status");
    const code = jsonString(notification.payload, "code");
    const labels: Record<string, string> = {
      pending_payment: "en attente de paiement",
      payment_declared: "paiement déclaré",
      paid: "payée",
      confirmed: "confirmée",
      ready: "prête",
      completed: "terminée",
      cancelled: "annulée",
      refunded: "remboursée",
    };
    const label = status ? (labels[status] ?? "mise à jour") : "mise à jour";
    return code
      ? `La commande ${code} est ${label}.`
      : `Le statut de ta commande a changé : ${label}.`;
  }

  if (notification.type === "shop_review") {
    const approved = jsonBoolean(notification.payload, "approved");
    const reason = jsonString(notification.payload, "reason");
    if (approved) return "Ta boutique a été approuvée et publiée.";
    return reason
      ? `Ta boutique doit être corrigée : ${reason}`
      : "Ta boutique doit être corrigée avant sa publication.";
  }

  if (notification.type === "order_cancellation_request") {
    const code = jsonString(notification.payload, "code");
    const resolution = jsonString(notification.payload, "resolution");
    const order = code ? `La commande ${code}` : "La commande";
    if (resolution === "requested") {
      return `${order} : le client demande une annulation.`;
    }
    if (resolution === "refunded") {
      return `${order} a été remboursée.`;
    }
    if (resolution === "cancelled") {
      return `${order} a été annulée, sans paiement reçu selon la boutique.`;
    }
    if (resolution === "rejected") {
      return `La demande d’annulation de ${order.toLowerCase()} a été refusée.`;
    }
  }

  return "Une nouvelle activité concerne ton compte.";
}

function jsonString(payload: AppNotification["payload"], key: string) {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return null;
  }
  const value = payload[key];
  return typeof value === "string" ? value : null;
}

function jsonBoolean(payload: AppNotification["payload"], key: string) {
  if (
    typeof payload !== "object" ||
    payload === null ||
    Array.isArray(payload)
  ) {
    return false;
  }
  return payload[key] === true;
}
