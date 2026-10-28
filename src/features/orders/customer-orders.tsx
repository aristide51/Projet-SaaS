"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  cancelCustomerOrder,
  requestCustomerOrderCancellation,
} from "./customer-actions";
import { CUSTOMER_ORDER_PAGE_SIZE } from "./types";
import {
  ORDER_STATUS_LABELS,
  type OrderItemRow,
  type OrderStatusHistoryRow,
  type OrderStatus,
} from "./types";
import { ReviewForm } from "@/features/reviews/review-form";
import { savePrivateSnapshot } from "@/lib/pwa/private-data";
import { useOfflineStatus } from "@/lib/pwa/use-offline-status";

export type CustomerOrder = {
  id: string;
  code: string;
  shop_id: string;
  status: OrderStatus;
  payment_method: string;
  fulfillment: string;
  total: number;
  created_at: string;
  delivery_address: string | null;
  note: string | null;
  items: Pick<
    OrderItemRow,
    "id" | "name_snapshot" | "unit_price" | "quantity"
  >[];
  history: Pick<
    OrderStatusHistoryRow,
    "id" | "from_status" | "to_status" | "created_at" | "note"
  >[];
  cancellationRequest: {
    id: string;
    status: "pending" | "refunded" | "cancelled" | "rejected";
    customer_note: string | null;
    resolution_note: string | null;
    requested_at: string;
    resolved_at: string | null;
  } | null;
  reviewed: boolean;
};

export type ShopSummary = { id: string; name: string; slug: string };

const money = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});

const dateTime = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Ouagadougou",
});

export function CustomerOrders({
  orders,
  shops,
  currentPage,
  totalCount,
  userId,
}: {
  orders: CustomerOrder[];
  shops: ShopSummary[];
  currentPage: number;
  totalCount: number;
  userId: string;
}) {
  const router = useRouter();
  const [busyOrder, setBusyOrder] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [requestNotes, setRequestNotes] = useState<Record<string, string>>({});
  const isOffline = useOfflineStatus();
  const [offlineStorageError, setOfflineStorageError] = useState(false);
  const shopById = new Map(shops.map((shop) => [shop.id, shop]));

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
    void savePrivateSnapshot(userId, "orders", {
      orders: orders.map((order) => ({
        code: order.code,
        shop_id: order.shop_id,
        status: order.status,
        total: order.total,
        created_at: order.created_at,
        items: order.items.map((item) => ({
          name_snapshot: item.name_snapshot,
          quantity: item.quantity,
        })),
      })),
      shops: shops.map(({ id, name }) => ({ id, name })),
    }).catch(() => {
      if (active) setOfflineStorageError(true);
    });

    return () => {
      active = false;
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [orders, router, shops, userId]);

  async function cancel(orderId: string) {
    if (!window.confirm("Veux-tu vraiment annuler cette commande ?")) return;
    setBusyOrder(orderId);
    setMessage("");
    setError("");
    const result = await cancelCustomerOrder({ orderId });
    setBusyOrder(null);
    if (!result.success) {
      setError(result.message);
      return;
    }
    setMessage(result.message);
    router.refresh();
  }

  async function requestCancellation(orderId: string) {
    if (
      !window.confirm(
        "Envoyer une demande d’annulation à la boutique ? Si un paiement a été reçu, la boutique devra confirmer le remboursement.",
      )
    ) {
      return;
    }
    setBusyOrder(orderId);
    setMessage("");
    setError("");
    const result = await requestCustomerOrderCancellation({
      orderId,
      note: requestNotes[orderId] ?? "",
    });
    setBusyOrder(null);
    if (!result.success) {
      setError(result.message);
      return;
    }
    setMessage(result.message);
    router.refresh();
  }

  return (
    <section
      className="customer-orders"
      aria-labelledby="customer-orders-title"
    >
      <div>
        <p className="auth-eyebrow">Mes achats</p>
        <h2 id="customer-orders-title">Mes commandes</h2>
        <p className="customer-orders__count">
          {totalCount} commande{totalCount > 1 ? "s" : ""} au total
        </p>
      </div>

      {isOffline ? (
        <p className="ui-message" role="status">
          Hors connexion : consultation uniquement. Annulation, demande
          d’annulation, avis et paiement sont désactivés.
        </p>
      ) : null}
      {offlineStorageError ? (
        <p className="ui-message ui-message--error" role="status">
          Les commandes ne pourront pas être consultées hors connexion sur cet
          appareil.
        </p>
      ) : null}
      {error ? (
        <p className="auth-form__error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="auth-form__success" role="status">
          {message}
        </p>
      ) : null}

      {orders.length ? (
        <ul className="customer-orders__list">
          {orders.map((order) => {
            const shop = shopById.get(order.shop_id);
            const isBusy = busyOrder === order.id;
            return (
              <li className="customer-order" key={order.id}>
                <header className="customer-order__header">
                  <div>
                    <h3>{order.code}</h3>
                    <p>
                      {shop?.name ?? "Boutique"} ·{" "}
                      {dateTime.format(new Date(order.created_at))}
                    </p>
                  </div>
                  <span
                    className={`orders-status orders-status--${order.status}`}
                  >
                    {ORDER_STATUS_LABELS[order.status]}
                  </span>
                </header>
                <ul className="customer-order__items">
                  {order.items.map((item) => (
                    <li key={item.id}>
                      <span>
                        {item.name_snapshot} × {item.quantity}
                      </span>
                      <span>
                        {money.format(item.unit_price * item.quantity)} FCFA
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="customer-order__total">
                  Total : <strong>{money.format(order.total)} FCFA</strong>
                </p>
                {order.cancellationRequest ? (
                  <section
                    aria-label="Demande d’annulation"
                    className="customer-order__request"
                  >
                    <strong>
                      {order.cancellationRequest.status === "pending"
                        ? "Demande d’annulation en attente de la boutique"
                        : order.cancellationRequest.status === "refunded"
                          ? "Remboursement confirmé par la boutique"
                          : order.cancellationRequest.status === "cancelled"
                            ? "Commande annulée : la boutique confirme n’avoir reçu aucun paiement"
                            : "Demande d’annulation refusée"}
                    </strong>
                    {order.cancellationRequest.resolution_note ? (
                      <p>{order.cancellationRequest.resolution_note}</p>
                    ) : null}
                  </section>
                ) : null}
                <ol className="customer-order__history">
                  {[...order.history]
                    .sort((a, b) => a.created_at.localeCompare(b.created_at))
                    .map((entry) => (
                      <li key={entry.id}>
                        <span>{ORDER_STATUS_LABELS[entry.to_status]}</span>
                        <time dateTime={entry.created_at}>
                          {dateTime.format(new Date(entry.created_at))}
                        </time>
                        {entry.note ? <p>{entry.note}</p> : null}
                      </li>
                    ))}
                </ol>
                {order.status === "completed" ? (
                  order.reviewed ? (
                    <p className="ui-message ui-message--success">
                      Merci, tu as déjà évalué cette expérience.
                    </p>
                  ) : isOffline ? (
                    <p className="ui-message">
                      La publication d’un avis nécessite une connexion.
                    </p>
                  ) : (
                    <ReviewForm orderId={order.id} shopId={order.shop_id} />
                  )
                ) : null}
                <div className="customer-order__actions">
                  {shop &&
                  order.payment_method.startsWith("ussd_") &&
                  ["pending_payment", "payment_declared"].includes(
                    order.status,
                  ) ? (
                    isOffline ? (
                      <span
                        className="ui-button ui-button--secondary"
                        aria-disabled="true"
                      >
                        Paiement indisponible hors connexion
                      </span>
                    ) : (
                      <Link
                        className="ui-button ui-button--secondary"
                        href={`/${encodeURIComponent(shop.slug)}/payment/${encodeURIComponent(order.id)}`}
                      >
                        Voir le paiement
                      </Link>
                    )
                  ) : null}
                  {order.status === "pending_payment" ? (
                    <button
                      className="ui-button ui-button--secondary"
                      disabled={isBusy || isOffline}
                      onClick={() => void cancel(order.id)}
                      type="button"
                    >
                      {isBusy ? "Annulation…" : "Annuler la commande"}
                    </button>
                  ) : null}
                  {["payment_declared", "paid", "confirmed", "ready"].includes(
                    order.status,
                  ) && order.cancellationRequest?.status !== "pending" ? (
                    <div className="customer-order__request-form">
                      <label>
                        Motif (facultatif)
                        <textarea
                          disabled={isBusy || isOffline}
                          maxLength={500}
                          onChange={(event) =>
                            setRequestNotes((previous) => ({
                              ...previous,
                              [order.id]: event.target.value,
                            }))
                          }
                          value={requestNotes[order.id] ?? ""}
                        />
                      </label>
                      <button
                        className="ui-button ui-button--secondary"
                        disabled={isBusy || isOffline}
                        onClick={() => void requestCancellation(order.id)}
                        type="button"
                      >
                        {isBusy ? "Envoi…" : "Demander l’annulation"}
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="customer-orders__empty">
          Tu n’as pas encore passé de commande.
        </p>
      )}
      {totalCount > CUSTOMER_ORDER_PAGE_SIZE ? (
        <nav
          aria-label="Pagination des commandes"
          className="customer-orders__pagination"
        >
          {currentPage > 1 ? (
            <Link
              className="ui-button ui-button--secondary"
              href={
                currentPage === 2
                  ? "/account"
                  : `/account?ordersPage=${currentPage - 1}`
              }
            >
              Précédentes
            </Link>
          ) : (
            <span
              className="ui-button ui-button--secondary"
              aria-disabled="true"
            >
              Précédentes
            </span>
          )}
          <span>
            Page {currentPage} sur{" "}
            {Math.ceil(totalCount / CUSTOMER_ORDER_PAGE_SIZE)}
          </span>
          {currentPage < Math.ceil(totalCount / CUSTOMER_ORDER_PAGE_SIZE) ? (
            <Link
              className="ui-button ui-button--secondary"
              href={`/account?ordersPage=${currentPage + 1}`}
            >
              Suivantes
            </Link>
          ) : (
            <span
              className="ui-button ui-button--secondary"
              aria-disabled="true"
            >
              Suivantes
            </span>
          )}
        </nav>
      ) : null}
    </section>
  );
}
