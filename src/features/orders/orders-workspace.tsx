"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import {
  confirmPayment,
  cancelOrder,
  markPaidManually,
  progressOrder,
  rejectDeclaration,
  resolveCancellationRequest,
  refundOrder,
  exportOrdersCsv,
} from "./actions";
import { OrdersLiveAlerts } from "./orders-live-alerts";
import {
  ORDER_STATUS_LABELS,
  type OrderWithDetails,
  type OrderStatus,
} from "./types";

type ShopOption = { id: string; name: string };
type OrderWithProof = OrderWithDetails & { proofUrl: string | null };

const orderStatuses: OrderStatus[] = [
  "pending_payment",
  "payment_declared",
  "paid",
  "confirmed",
  "ready",
  "completed",
  "cancelled",
  "refunded",
];

const money = new Intl.NumberFormat("fr-FR", {
  maximumFractionDigits: 0,
});

const dateTime = new Intl.DateTimeFormat("fr-FR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Africa/Ouagadougou",
});

export function OrdersWorkspace({
  shopId,
  shops,
  orders,
  selectedStatus,
  dateFrom,
  dateTo,
}: {
  shopId: string;
  shops: ShopOption[];
  orders: OrderWithProof[];
  selectedStatus: string;
  dateFrom: string;
  dateTo: string;
}) {
  const router = useRouter();
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [cancelReasons, setCancelReasons] = useState<Record<string, string>>(
    {},
  );
  const [refundReferences, setRefundReferences] = useState<
    Record<string, string>
  >({});
  const [requestNotes, setRequestNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  function currentFilters() {
    return {
      ...(selectedStatus ? { status: selectedStatus } : {}),
      ...(dateFrom ? { dateFrom: `${dateFrom}T00:00:00.000Z` } : {}),
      ...(dateTo ? { dateTo: `${dateTo}T23:59:59.999Z` } : {}),
    };
  }

  async function runAction(
    orderId: string,
    action: typeof confirmPayment | typeof markPaidManually,
    input: { orderId: string; transactionRef?: string },
  ) {
    setBusyOrderId(orderId);
    setMessage("");
    setError("");
    const result = await action(shopId, input);
    setBusyOrderId(null);
    if (!result.success) {
      setError(result.message);
      return;
    }
    setMessage(result.message);
    router.refresh();
  }

  async function markPaid(orderId: string) {
    if (
      !window.confirm(
        "Confirmer que le paiement en espèces a bien été reçu ? Cette action sera enregistrée dans l’historique.",
      )
    ) {
      return;
    }
    await runAction(orderId, markPaidManually, { orderId });
  }

  async function exportCsv() {
    setMessage("");
    setError("");
    const result = await exportOrdersCsv(shopId, currentFilters());
    if (!result.success) {
      setError(result.message);
      return;
    }

    const url = URL.createObjectURL(
      new Blob(["\uFEFF", result.csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = result.filename;
    link.click();
    URL.revokeObjectURL(url);
    setMessage("Export CSV téléchargé.");
  }

  async function reject(orderId: string) {
    const reason = reasons[orderId]?.trim() ?? "";
    if (!reason) {
      setError("Indique le motif du rejet.");
      return;
    }
    setBusyOrderId(orderId);
    setMessage("");
    setError("");
    const result = await rejectDeclaration(shopId, { orderId, reason });
    setBusyOrderId(null);
    if (!result.success) {
      setError(result.message);
      return;
    }
    setMessage(result.message);
    router.refresh();
  }

  async function progress(orderId: string, nextStatus: OrderStatus) {
    setBusyOrderId(orderId);
    setMessage("");
    setError("");
    const result = await progressOrder(shopId, { orderId, nextStatus });
    setBusyOrderId(null);
    if (!result.success) {
      setError(result.message);
      return;
    }
    setMessage(result.message);
    router.refresh();
  }

  async function cancel(orderId: string) {
    const reason = cancelReasons[orderId]?.trim() ?? "";
    if (!reason) {
      setError("Indique le motif de l’annulation.");
      return;
    }
    setBusyOrderId(orderId);
    setMessage("");
    setError("");
    const result = await cancelOrder(shopId, { orderId, reason });
    setBusyOrderId(null);
    if (!result.success) {
      setError(result.message);
      return;
    }
    setMessage(result.message);
    router.refresh();
  }

  async function refund(order: OrderWithProof) {
    const refundReference = refundReferences[order.id]?.trim() ?? "";
    if (order.payment_method.startsWith("ussd_") && !refundReference) {
      setError("Saisis la référence du remboursement USSD.");
      return;
    }
    if (
      !window.confirm(
        "Le remboursement doit être effectué en dehors de la plateforme. Confirme uniquement après avoir rendu l’argent au client.",
      )
    ) {
      return;
    }
    setBusyOrderId(order.id);
    setMessage("");
    setError("");
    const result = await refundOrder(shopId, {
      orderId: order.id,
      ...(refundReference ? { refundReference } : {}),
    });
    setBusyOrderId(null);
    if (!result.success) {
      setError(result.message);
      return;
    }
    setMessage(result.message);
    router.refresh();
  }

  async function resolveRequest(
    order: OrderWithProof,
    resolution: "refunded" | "cancelled" | "rejected",
  ) {
    const request = order.cancellationRequest;
    if (!request) return;
    const note = requestNotes[request.id]?.trim() ?? "";
    const refundReference = refundReferences[request.id]?.trim() ?? "";
    if (resolution !== "refunded" && !note) {
      setError(
        resolution === "cancelled"
          ? "Confirme par un motif que le paiement n’a pas été reçu."
          : "Indique le motif du refus.",
      );
      return;
    }
    if (
      resolution === "refunded" &&
      order.payment_method.startsWith("ussd_") &&
      !refundReference
    ) {
      setError("Saisis la référence du remboursement USSD.");
      return;
    }
    if (
      resolution === "refunded" &&
      !window.confirm(
        "Confirme uniquement après avoir remboursé le client hors plateforme.",
      )
    ) {
      return;
    }
    if (
      resolution === "cancelled" &&
      !window.confirm(
        "Confirmer que tu n’as pas reçu le paiement et annuler la commande ?",
      )
    ) {
      return;
    }

    setBusyOrderId(order.id);
    setMessage("");
    setError("");
    const result = await resolveCancellationRequest(shopId, {
      requestId: request.id,
      resolution,
      ...(note ? { note } : {}),
      ...(refundReference ? { refundReference } : {}),
    });
    setBusyOrderId(null);
    if (!result.success) {
      setError(result.message);
      return;
    }
    setMessage(result.message);
    router.refresh();
  }

  return (
    <main className="orders-shell">
      <header className="orders-header">
        <div>
          <p className="auth-eyebrow">Espace commerçant</p>
          <h1>Commandes</h1>
          <p>Vérifie les paiements déclarés et prépare les commandes.</p>
        </div>
        <form action="/dashboard/orders" className="orders-filters">
          {shops.length > 1 ? (
            <label>
              Boutique
              <select defaultValue={shopId} name="shop">
                {shops.map((shop) => (
                  <option key={shop.id} value={shop.id}>
                    {shop.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <input name="shop" type="hidden" value={shopId} />
          )}
          <label>
            Statut
            <select defaultValue={selectedStatus} name="status">
              <option value="">Tous les statuts</option>
              {orderStatuses.map((status) => (
                <option key={status} value={status}>
                  {ORDER_STATUS_LABELS[status]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Du
            <input defaultValue={dateFrom} name="dateFrom" type="date" />
          </label>
          <label>
            Au
            <input defaultValue={dateTo} name="dateTo" type="date" />
          </label>
          <button className="ui-button ui-button--secondary" type="submit">
            Filtrer
          </button>
          <button
            className="ui-button ui-button--secondary"
            onClick={() => void exportCsv()}
            type="button"
          >
            Exporter en CSV
          </button>
        </form>
      </header>

      <OrdersLiveAlerts shopId={shopId} />

      {error ? (
        <p className="auth-form__error" role="alert">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="catalog-message" role="status">
          {message}
        </p>
      ) : null}

      <section aria-label="Liste des commandes" className="orders-panel">
        <h2>
          {orders.length} commande{orders.length > 1 ? "s" : ""}
        </h2>
        {orders.length ? (
          <ul className="orders-list">
            {orders.map((order) => {
              const declaration = order.declaration;
              const cancellationRequest = order.cancellationRequest;
              const isBusy = busyOrderId === order.id;

              return (
                <li className="orders-card" key={order.id}>
                  <div className="orders-card__heading">
                    <div>
                      <h3>{order.code}</h3>
                      <p>{dateTime.format(new Date(order.created_at))}</p>
                    </div>
                    <span
                      className={`orders-status orders-status--${order.status}`}
                    >
                      {ORDER_STATUS_LABELS[order.status]}
                    </span>
                  </div>

                  <dl className="orders-details">
                    <div>
                      <dt>Client</dt>
                      <dd>{order.customer_name || "Client"}</dd>
                    </div>
                    <div>
                      <dt>Téléphone</dt>
                      <dd>{order.customer_phone || "Non renseigné"}</dd>
                    </div>
                    <div>
                      <dt>Total</dt>
                      <dd>{money.format(order.total)} FCFA</dd>
                    </div>
                    <div>
                      <dt>Articles</dt>
                      <dd>
                        {order.items
                          .map(
                            (item) =>
                              `${item.name_snapshot} × ${item.quantity}`,
                          )
                          .join(", ")}
                      </dd>
                    </div>
                    <div>
                      <dt>Mode</dt>
                      <dd>
                        {order.fulfillment === "delivery"
                          ? "Livraison"
                          : "Retrait"}
                        {" · "}
                        {order.payment_method.replaceAll("_", " ")}
                      </dd>
                    </div>
                    {order.delivery_address ? (
                      <div>
                        <dt>Adresse</dt>
                        <dd>{order.delivery_address}</dd>
                      </div>
                    ) : null}
                    {order.note ? (
                      <div>
                        <dt>Note du client</dt>
                        <dd>{order.note}</dd>
                      </div>
                    ) : null}
                  </dl>

                  {cancellationRequest?.status === "pending" ? (
                    <section
                      aria-label="Demande d’annulation du client"
                      className="orders-cancellation-request"
                    >
                      <h4>Demande d’annulation du client</h4>
                      {cancellationRequest.customer_note ? (
                        <p>
                          Motif du client : {cancellationRequest.customer_note}
                        </p>
                      ) : (
                        <p>Le client n’a pas ajouté de motif.</p>
                      )}
                      <label>
                        {order.status === "payment_declared"
                          ? "Motif (obligatoire pour refus ou absence de paiement)"
                          : "Motif du refus"}
                        <textarea
                          disabled={isBusy}
                          maxLength={500}
                          onChange={(event) =>
                            setRequestNotes((previous) => ({
                              ...previous,
                              [cancellationRequest.id]: event.target.value,
                            }))
                          }
                          value={requestNotes[cancellationRequest.id] ?? ""}
                        />
                      </label>
                      {order.payment_method.startsWith("ussd_") ? (
                        <label>
                          Référence du remboursement USSD
                          <input
                            autoComplete="off"
                            disabled={isBusy}
                            maxLength={40}
                            onChange={(event) =>
                              setRefundReferences((previous) => ({
                                ...previous,
                                [cancellationRequest.id]: event.target.value,
                              }))
                            }
                            value={
                              refundReferences[cancellationRequest.id] ?? ""
                            }
                          />
                        </label>
                      ) : null}
                      <div className="orders-actions">
                        <button
                          className="ui-button ui-button--primary"
                          disabled={
                            isBusy ||
                            (order.payment_method.startsWith("ussd_") &&
                              !refundReferences[cancellationRequest.id]?.trim())
                          }
                          onClick={() => void resolveRequest(order, "refunded")}
                          type="button"
                        >
                          {isBusy ? "Traitement…" : "Remboursement effectué"}
                        </button>
                        {order.status === "payment_declared" ? (
                          <button
                            className="ui-button ui-button--secondary"
                            disabled={
                              isBusy ||
                              !requestNotes[cancellationRequest.id]?.trim()
                            }
                            onClick={() =>
                              void resolveRequest(order, "cancelled")
                            }
                            type="button"
                          >
                            Annuler : paiement non reçu
                          </button>
                        ) : null}
                        <button
                          className="ui-button ui-button--secondary"
                          disabled={
                            isBusy ||
                            !requestNotes[cancellationRequest.id]?.trim()
                          }
                          onClick={() => void resolveRequest(order, "rejected")}
                          type="button"
                        >
                          Refuser la demande
                        </button>
                      </div>
                    </section>
                  ) : null}

                  {order.history.length ? (
                    <section
                      className="orders-timeline"
                      aria-label="Suivi de la commande"
                    >
                      <h4>Historique</h4>
                      <ol>
                        {[...order.history]
                          .sort((a, b) =>
                            a.created_at.localeCompare(b.created_at),
                          )
                          .map((entry) => (
                            <li key={entry.id}>
                              <span>
                                {entry.from_status
                                  ? ORDER_STATUS_LABELS[entry.from_status]
                                  : "Créée"}
                                {" → "}
                                {ORDER_STATUS_LABELS[entry.to_status]}
                              </span>
                              <time dateTime={entry.created_at}>
                                {dateTime.format(new Date(entry.created_at))}
                              </time>
                              {entry.note ? <p>{entry.note}</p> : null}
                            </li>
                          ))}
                      </ol>
                    </section>
                  ) : null}

                  {order.status === "payment_declared" && declaration ? (
                    <section
                      className="orders-payment"
                      aria-label="Déclaration de paiement"
                    >
                      <h4>Vérifier la déclaration</h4>
                      <p>
                        Référence <strong>{declaration.transaction_ref}</strong>
                        {" · "}payeur <strong>{declaration.payer_phone}</strong>
                      </p>
                      {declaration.screenshot_path ? (
                        order.proofUrl ? (
                          <a
                            className="ui-button ui-button--secondary"
                            href={order.proofUrl}
                            rel="noreferrer"
                            target="_blank"
                          >
                            Voir la capture privée
                          </a>
                        ) : (
                          <p role="status">
                            La capture est momentanément indisponible.
                          </p>
                        )
                      ) : (
                        <p>Aucune capture jointe.</p>
                      )}
                      <p className="orders-reminder">
                        Compare le montant, le numéro et la référence dans ton
                        historique Orange Money ou Moov avant de confirmer.
                      </p>
                      <div className="orders-actions">
                        <button
                          className="ui-button ui-button--primary"
                          disabled={isBusy}
                          onClick={() =>
                            void runAction(order.id, confirmPayment, {
                              orderId: order.id,
                              transactionRef: declaration.transaction_ref,
                            })
                          }
                          type="button"
                        >
                          {isBusy ? "Traitement…" : "Paiement reçu"}
                        </button>
                        {order.reject_count < 1 ? (
                          <div className="orders-reject">
                            <label>
                              Motif du rejet
                              <textarea
                                disabled={isBusy}
                                maxLength={500}
                                onChange={(event) =>
                                  setReasons((previous) => ({
                                    ...previous,
                                    [order.id]: event.target.value,
                                  }))
                                }
                                value={reasons[order.id] ?? ""}
                              />
                            </label>
                            <button
                              className="ui-button ui-button--secondary"
                              disabled={isBusy || !reasons[order.id]?.trim()}
                              onClick={() => void reject(order.id)}
                              type="button"
                            >
                              Rejeter avec motif
                            </button>
                          </div>
                        ) : (
                          <p>
                            La correction autorisée a déjà été utilisée. Le
                            paiement ne peut plus être rejeté.
                          </p>
                        )}
                      </div>
                    </section>
                  ) : null}

                  {order.status === "pending_payment" &&
                  ["cash_on_delivery", "pay_at_pickup"].includes(
                    order.payment_method,
                  ) ? (
                    <button
                      className="ui-button ui-button--primary"
                      disabled={isBusy}
                      onClick={() => void markPaid(order.id)}
                      type="button"
                    >
                      {isBusy ? "Traitement…" : "Marquer comme payée"}
                    </button>
                  ) : null}

                  {order.status === "paid" ||
                  order.status === "confirmed" ||
                  order.status === "ready" ? (
                    <>
                      <div className="orders-actions">
                        <button
                          className="ui-button ui-button--primary"
                          disabled={isBusy}
                          onClick={() =>
                            void progress(
                              order.id,
                              order.status === "paid"
                                ? "confirmed"
                                : order.status === "confirmed"
                                  ? "ready"
                                  : "completed",
                            )
                          }
                          type="button"
                        >
                          {isBusy
                            ? "Mise à jour…"
                            : order.status === "paid"
                              ? "Confirmer la commande"
                              : order.status === "confirmed"
                                ? "Marquer comme prête"
                                : "Marquer comme terminée"}
                        </button>
                      </div>
                      <section className="orders-refund">
                        <h4>Rembourser le client</h4>
                        <p>
                          Effectue le remboursement hors plateforme avant de
                          confirmer cette action.
                        </p>
                        {order.payment_method.startsWith("ussd_") ? (
                          <label>
                            Référence du remboursement USSD
                            <input
                              autoComplete="off"
                              disabled={isBusy}
                              maxLength={40}
                              onChange={(event) =>
                                setRefundReferences((previous) => ({
                                  ...previous,
                                  [order.id]: event.target.value,
                                }))
                              }
                              value={refundReferences[order.id] ?? ""}
                            />
                          </label>
                        ) : null}
                        <button
                          className="ui-button ui-button--secondary"
                          disabled={
                            isBusy ||
                            (order.payment_method.startsWith("ussd_") &&
                              !refundReferences[order.id]?.trim())
                          }
                          onClick={() => void refund(order)}
                          type="button"
                        >
                          {isBusy
                            ? "Traitement…"
                            : "Confirmer le remboursement"}
                        </button>
                      </section>
                    </>
                  ) : null}

                  {order.status === "pending_payment" ? (
                    <section className="orders-cancel">
                      <h4>Annuler la commande</h4>
                      <label>
                        Motif obligatoire
                        <textarea
                          disabled={isBusy}
                          maxLength={500}
                          onChange={(event) =>
                            setCancelReasons((previous) => ({
                              ...previous,
                              [order.id]: event.target.value,
                            }))
                          }
                          value={cancelReasons[order.id] ?? ""}
                        />
                      </label>
                      <button
                        className="ui-button ui-button--secondary"
                        disabled={isBusy || !cancelReasons[order.id]?.trim()}
                        onClick={() => void cancel(order.id)}
                        type="button"
                      >
                        {isBusy ? "Traitement…" : "Annuler la commande"}
                      </button>
                    </section>
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="orders-empty">
            Aucune commande ne correspond à ce filtre.
          </p>
        )}
      </section>
    </main>
  );
}
