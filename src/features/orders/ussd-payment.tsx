"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { declarePayment } from "./payment-actions";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";

type OrderStatus = Database["public"]["Enums"]["order_status"];
type DeclarationStatus = Database["public"]["Enums"]["declaration_status"];

type Props = {
  order: {
    id: string;
    code: string;
    status: OrderStatus;
    paymentMethod: string;
    total: number;
    expiresAt: string | null;
    rejectCount: number;
  };
  declaration: {
    payerPhone: string;
    transactionReference: string;
    status: DeclarationStatus;
    rejectReason: string | null;
  } | null;
  shop: {
    id: string;
    name: string;
    slug: string;
  };
  paymentMethod: {
    phoneOrCode: string | null;
    ussdTemplate: string | null;
  } | null;
};

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_payment: "En attente de paiement",
  payment_declared: "Paiement déclaré, vérification en cours",
  paid: "Paiement confirmé",
  confirmed: "Commande confirmée",
  ready: "Commande prête",
  completed: "Commande terminée",
  cancelled: "Commande annulée",
  refunded: "Commande remboursée",
};

function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && Object.hasOwn(STATUS_LABELS, value);
}

function formatPrice(amount: number) {
  return `${new Intl.NumberFormat("fr-FR").format(amount)} FCFA`;
}

function formatRemainingTime(milliseconds: number) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${remainingSeconds.toString().padStart(2, "0")}`;
}

function hasUsableUssdCode(template: string | null) {
  return Boolean(template && /^[0-9*#]+$/.test(template.trim()));
}

export function UssdPayment({
  order: initialOrder,
  declaration,
  shop,
  paymentMethod,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState(initialOrder.status);
  const [rejectCount, setRejectCount] = useState(initialOrder.rejectCount);
  const [remaining, setRemaining] = useState<number | null>(() =>
    initialOrder.expiresAt
      ? Math.max(0, new Date(initialOrder.expiresAt).getTime() - Date.now())
      : null,
  );
  const [payerPhone, setPayerPhone] = useState(declaration?.payerPhone ?? "");
  const [transactionReference, setTransactionReference] = useState("");
  const [proof, setProof] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!initialOrder.expiresAt) return;
    const updateRemaining = () => {
      setRemaining(
        Math.max(0, new Date(initialOrder.expiresAt!).getTime() - Date.now()),
      );
    };
    updateRemaining();
    const interval = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(interval);
  }, [initialOrder.expiresAt]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`order-payment:${initialOrder.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `id=eq.${initialOrder.id}`,
        },
        (payload) => {
          const updated = payload.new;
          if (isOrderStatus(updated.status)) {
            setStatus(updated.status);
          }
          if (typeof updated.reject_count === "number") {
            setRejectCount(updated.reject_count);
          }
          router.refresh();
        },
      )
      .subscribe((connection) => {
        if (connection === "CHANNEL_ERROR" || connection === "TIMED_OUT") {
          setMessage(
            "Le suivi en direct est momentanément indisponible. Recharge la page pour vérifier le statut.",
          );
        }
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [initialOrder.id, router]);

  const isExpired = remaining !== null && remaining <= 0;
  const canDeclare =
    status === "pending_payment" && rejectCount < 2 && !isExpired;
  const code = paymentMethod?.ussdTemplate?.trim() ?? "";
  const canOpenUssd = hasUsableUssdCode(code);

  async function copyCode() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setMessage("Code USSD copié.");
    } catch {
      setMessage(
        "Copie indisponible. Sélectionne le code affiché pour le copier.",
      );
    }
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !canDeclare) return;
    setBusy(true);
    setMessage("");
    try {
      const result = await declarePayment(
        shop.id,
        {
          orderId: initialOrder.id,
          payerPhone,
          transactionReference,
        },
        proof,
      );
      if (!result.success) {
        setMessage(result.message);
        return;
      }
      setStatus("payment_declared");
      setMessage("Déclaration envoyée. La boutique va vérifier le paiement.");
      router.refresh();
    } catch {
      setMessage(
        "La déclaration n’a pas pu être envoyée. Vérifie ta connexion.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ussd-payment">
      <p className="auth-eyebrow">{shop.name}</p>
      <h1>Paiement de la commande</h1>
      <p>
        Référence <strong>{initialOrder.code}</strong>
      </p>
      <div aria-label="Montant à payer" className="ussd-payment-amount">
        {formatPrice(initialOrder.total)}
      </div>
      <p aria-live="polite" className="ussd-payment-status" role="status">
        {STATUS_LABELS[status]}
      </p>

      {paymentMethod?.phoneOrCode ? (
        <section className="checkout-section">
          <h2>Envoyer le paiement</h2>
          <p>
            Envoie exactement <strong>{formatPrice(initialOrder.total)}</strong>{" "}
            au numéro ou code marchand :
          </p>
          <p className="ussd-payment-destination">
            {paymentMethod.phoneOrCode}
          </p>
          {code ? (
            <div className="ussd-payment-code">
              <p>Instruction USSD du commerçant</p>
              <code>{code}</code>
              <div className="checkout-actions">
                {canOpenUssd ? (
                  <a
                    className="ui-button ui-button--primary"
                    href={`tel:${encodeURIComponent(code)}`}
                  >
                    Ouvrir le composeur
                  </a>
                ) : null}
                <button
                  className="ui-button ui-button--secondary"
                  onClick={() => void copyCode()}
                  type="button"
                >
                  Copier le code
                </button>
              </div>
            </div>
          ) : null}
        </section>
      ) : (
        <p className="checkout-warning">
          Le numéro de paiement n’est plus disponible. Contacte la boutique
          avant d’effectuer un transfert.
        </p>
      )}

      {remaining !== null && status === "pending_payment" ? (
        <p className={isExpired ? "checkout-warning" : "ussd-payment-expiry"}>
          {isExpired
            ? "Le délai de paiement est dépassé."
            : `Cette commande expire dans ${formatRemainingTime(remaining)}.`}
        </p>
      ) : null}

      {declaration?.status === "rejected" ? (
        <div className="checkout-error" role="status">
          <strong>La boutique a rejeté la déclaration précédente.</strong>
          {declaration.rejectReason ? (
            <span>Motif : {declaration.rejectReason}</span>
          ) : null}
          {rejectCount >= 1 ? (
            <span>Vérifie la référence SMS avant de la corriger.</span>
          ) : null}
        </div>
      ) : null}

      {status === "payment_declared" ? (
        <p className="checkout-notice">
          Paiement déclaré avec la référence{" "}
          <strong>{declaration?.transactionReference}</strong>. Attends la
          vérification de la boutique.
        </p>
      ) : null}

      {canDeclare ? (
        <form
          className="checkout-form"
          onSubmit={(event) => void submit(event)}
        >
          <h2>Déclarer le paiement effectué</h2>
          <label className="checkout-field">
            Numéro qui a payé
            <input
              autoComplete="tel"
              inputMode="tel"
              onChange={(event) => setPayerPhone(event.target.value)}
              placeholder="70 00 00 00"
              required
              value={payerPhone}
            />
          </label>
          <label className="checkout-field">
            Référence de transaction reçue par SMS
            <input
              autoComplete="off"
              maxLength={40}
              onChange={(event) =>
                setTransactionReference(event.target.value.toUpperCase())
              }
              pattern="[A-Za-z0-9._-]{4,40}"
              required
              value={transactionReference}
            />
          </label>
          <label className="checkout-field">
            Capture du SMS (facultative, PNG/JPEG/WebP, 2 Mo maximum)
            <input
              accept="image/png,image/jpeg,image/webp"
              onChange={(event) => setProof(event.target.files?.[0] ?? null)}
              type="file"
            />
          </label>
          <p className="checkout-warning">
            Ne saisis jamais ton code secret mobile money. La plateforme ne
            reçoit pas l’argent : la boutique vérifie la réception.
          </p>
          <button
            className="ui-button ui-button--primary"
            disabled={busy}
            type="submit"
          >
            {busy ? "Envoi…" : "Envoyer ma déclaration"}
          </button>
        </form>
      ) : null}

      {status === "pending_payment" && rejectCount >= 2 ? (
        <p className="checkout-warning">
          La correction de cette déclaration n’est plus disponible. Contacte
          directement la boutique.
        </p>
      ) : null}
      {message ? (
        <p className="checkout-error" role="alert">
          {message}
        </p>
      ) : null}
      <Link
        className="checkout-back-link"
        href={`/${encodeURIComponent(shop.slug)}`}
      >
        Retour à la boutique
      </Link>
    </section>
  );
}
