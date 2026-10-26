"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  placeOrder,
  previewCheckout,
  type CheckoutPreviewResult,
  type PlaceOrderResult,
} from "./checkout-actions";
import type { CheckoutInput } from "./checkout-schemas";
import { useStorefrontCart } from "@/features/cart/storefront-cart";
import type { CartSnapshot } from "@/features/cart/data";
import type { Database } from "@/types/database";

type PaymentMethod = Database["public"]["Enums"]["payment_method_type"];
type Fulfillment = Database["public"]["Enums"]["fulfillment_type"];

type Props = {
  cart: CartSnapshot;
  fulfillmentOptions: Record<Fulfillment, boolean>;
  hasPhone: boolean;
  paymentMethods: { type: PaymentMethod; label: string }[];
  shopId: string;
  shopName: string;
  shopSlug: string;
};

type PreviewTotals = {
  subtotal: number;
  discount: number;
  total: number;
};

function formatPrice(amount: number) {
  return `${new Intl.NumberFormat("fr-FR").format(amount)} FCFA`;
}

function getFingerprint(values: CheckoutInput) {
  return JSON.stringify(values);
}

export function CheckoutForm({
  cart,
  fulfillmentOptions,
  hasPhone,
  paymentMethods,
  shopId,
  shopName,
  shopSlug,
}: Props) {
  const { clearCart } = useStorefrontCart();
  const router = useRouter();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    paymentMethods[0]?.type ?? "cash_on_delivery",
  );
  const [fulfillment, setFulfillment] = useState<Fulfillment>(
    fulfillmentOptions.pickup ? "pickup" : "delivery",
  );
  const [deliveryAddress, setDeliveryAddress] = useState("");
  const [note, setNote] = useState("");
  const [couponCode, setCouponCode] = useState("");
  const [preview, setPreview] = useState<PreviewTotals | null>(null);
  const [previewFingerprint, setPreviewFingerprint] = useState<string | null>(
    null,
  );
  const [errorMessage, setErrorMessage] = useState("");
  const [suggestion, setSuggestion] = useState("");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inFlight = useRef(false);

  const input: CheckoutInput = {
    cartId: cart.items[0]?.cart_id ?? "",
    paymentMethod,
    fulfillment,
    deliveryAddress,
    note,
    couponCode,
  };
  const fingerprint = getFingerprint(input);
  const hasPaymentMethods = paymentMethods.length > 0;
  const availableFulfillment =
    fulfillmentOptions.pickup || fulfillmentOptions.delivery;

  function invalidatePreview() {
    setPreview(null);
    setPreviewFingerprint(null);
    setErrorMessage("");
    setSuggestion("");
  }

  async function requestPreview() {
    if (inFlight.current || !hasPaymentMethods || !availableFulfillment) return;
    inFlight.current = true;
    setPending(true);
    setErrorMessage("");
    setSuggestion("");
    try {
      const result: CheckoutPreviewResult = await previewCheckout(
        shopId,
        input,
      );
      if (result.success) {
        setPreview({
          subtotal: result.subtotal,
          discount: result.discount,
          total: result.total,
        });
        setPreviewFingerprint(fingerprint);
      } else {
        setPreview(null);
        setPreviewFingerprint(null);
        setErrorMessage(result.message);
        setSuggestion(result.suggestion ?? "");
      }
    } catch {
      setErrorMessage("Le total n’a pas pu être calculé.");
      setSuggestion("Vérifie ta connexion et réessaie.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  async function submitOrder() {
    if (
      inFlight.current ||
      !preview ||
      previewFingerprint !== fingerprint ||
      !hasPhone
    ) {
      return;
    }
    inFlight.current = true;
    setPending(true);
    setErrorMessage("");
    setSuggestion("");
    try {
      const result: PlaceOrderResult = await placeOrder(shopId, input);
      if (result.success) {
        clearCart();
        if (paymentMethod.startsWith("ussd_")) {
          router.push(
            `/${encodeURIComponent(shopSlug)}/payment/${encodeURIComponent(result.orderId)}`,
          );
          return;
        }
        setOrderId(result.orderId);
        return;
      }
      setPreview(null);
      setPreviewFingerprint(null);
      setErrorMessage(result.message);
      setSuggestion(result.suggestion ?? "");
    } catch {
      setErrorMessage("La commande n’a pas pu être enregistrée.");
      setSuggestion("Vérifie ton espace commandes avant de réessayer.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  if (orderId) {
    return (
      <section aria-live="polite" className="checkout-success">
        <p className="auth-eyebrow">Commande enregistrée</p>
        <h2>Merci pour ta commande</h2>
        <p>
          La boutique a bien reçu ta commande. Son identifiant est{" "}
          <strong>{orderId.slice(0, 8).toUpperCase()}</strong>.
        </p>
        <Link
          className="ui-button ui-button--primary"
          href={`/${encodeURIComponent(shopSlug)}`}
        >
          Retour à {shopName}
        </Link>
      </section>
    );
  }

  return (
    <form
      className="checkout-form"
      onSubmit={(event) => {
        event.preventDefault();
        void submitOrder();
      }}
    >
      <section
        className="checkout-section"
        aria-labelledby="checkout-items-title"
      >
        <h2 id="checkout-items-title">Articles</h2>
        <ul className="checkout-items">
          {cart.items.map((item) => (
            <li key={item.item_id}>
              <span>
                {item.product_name}
                {item.variant_name ? ` · ${item.variant_name}` : ""} ×{" "}
                {item.quantity}
              </span>
              <strong>{formatPrice(item.unit_price * item.quantity)}</strong>
              {!item.can_order ? (
                <small className="checkout-item-warning">
                  Cet article devra être retiré ou rendu disponible avant la
                  commande.
                </small>
              ) : null}
            </li>
          ))}
        </ul>
      </section>

      <fieldset className="checkout-section checkout-fieldset">
        <legend>Réception</legend>
        {fulfillmentOptions.pickup ? (
          <label className="checkout-choice">
            <input
              checked={fulfillment === "pickup"}
              name="fulfillment"
              onChange={() => {
                setFulfillment("pickup");
                invalidatePreview();
              }}
              type="radio"
              value="pickup"
            />
            Retrait en boutique
          </label>
        ) : null}
        {fulfillmentOptions.delivery ? (
          <label className="checkout-choice">
            <input
              checked={fulfillment === "delivery"}
              name="fulfillment"
              onChange={() => {
                setFulfillment("delivery");
                invalidatePreview();
              }}
              type="radio"
              value="delivery"
            />
            Livraison
          </label>
        ) : null}
        {fulfillment === "delivery" && fulfillmentOptions.delivery ? (
          <label className="checkout-field">
            Adresse de livraison
            <textarea
              autoComplete="street-address"
              maxLength={300}
              onChange={(event) => {
                setDeliveryAddress(event.target.value);
                invalidatePreview();
              }}
              required
              rows={3}
              value={deliveryAddress}
            />
          </label>
        ) : null}
      </fieldset>

      <fieldset className="checkout-section checkout-fieldset">
        <legend>Mode de paiement</legend>
        {paymentMethods.map((method) => (
          <label className="checkout-choice" key={method.type}>
            <input
              checked={paymentMethod === method.type}
              name="paymentMethod"
              onChange={() => {
                setPaymentMethod(method.type);
                invalidatePreview();
              }}
              type="radio"
              value={method.type}
            />
            {method.label}
          </label>
        ))}
        {!hasPaymentMethods ? (
          <p className="checkout-warning">
            Aucun mode de paiement n’est configuré pour cette boutique.
          </p>
        ) : null}
      </fieldset>

      <label className="checkout-field">
        Code promo (facultatif)
        <input
          autoComplete="off"
          maxLength={24}
          onChange={(event) => {
            setCouponCode(event.target.value.toUpperCase());
            invalidatePreview();
          }}
          placeholder="Ex. BIENVENUE"
          value={couponCode}
        />
      </label>

      <label className="checkout-field">
        Note pour la boutique (facultatif)
        <textarea
          maxLength={500}
          onChange={(event) => {
            setNote(event.target.value);
            invalidatePreview();
          }}
          rows={3}
          value={note}
        />
      </label>

      {!availableFulfillment ? (
        <p className="checkout-warning">
          Aucun mode de retrait ou de livraison n’est activé par la boutique.
        </p>
      ) : null}
      {!hasPhone ? (
        <p className="checkout-warning">
          Ajoute ton numéro de téléphone à ton profil pour passer commande.
        </p>
      ) : null}

      {errorMessage ? (
        <div className="checkout-error" role="alert">
          <strong>{errorMessage}</strong>
          {suggestion ? <span>{suggestion}</span> : null}
        </div>
      ) : null}

      {preview && previewFingerprint === fingerprint ? (
        <section aria-label="Récapitulatif du total" className="checkout-total">
          <p>
            <span>Sous-total</span>
            <strong>{formatPrice(preview.subtotal)}</strong>
          </p>
          <p>
            <span>Remise</span>
            <strong>− {formatPrice(preview.discount)}</strong>
          </p>
          <p className="checkout-total__final">
            <span>Total à payer</span>
            <strong>{formatPrice(preview.total)}</strong>
          </p>
        </section>
      ) : null}

      <div className="checkout-actions">
        <button
          className="ui-button ui-button--secondary"
          disabled={pending || !hasPaymentMethods || !availableFulfillment}
          onClick={(event) => {
            event.preventDefault();
            void requestPreview();
          }}
          type="button"
        >
          {pending && !preview ? "Calcul en cours…" : "Calculer mon total"}
        </button>
        {preview && previewFingerprint === fingerprint ? (
          <button
            className="ui-button ui-button--primary"
            disabled={pending || !hasPhone}
            type="submit"
          >
            {pending ? "Enregistrement…" : "Confirmer la commande"}
          </button>
        ) : null}
      </div>
      <Link
        className="checkout-back-link"
        href={`/${encodeURIComponent(shopSlug)}`}
      >
        Retour à la boutique
      </Link>
    </form>
  );
}
