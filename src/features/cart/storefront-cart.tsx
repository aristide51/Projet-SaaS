"use client";

import {
  createContext,
  startTransition,
  useContext,
  useEffect,
  useOptimistic,
  useState,
  type ReactNode,
} from "react";
import Link from "next/link";
import {
  addCartItem,
  loadCartForShop,
  mergeGuestCartForShop,
  removeCartItem,
  setCartItemQuantity,
} from "./actions";
import type { CartLine, CartSnapshot } from "./data";
import type { CartActionResult } from "./actions";

type CartContextValue = {
  addItem: (
    item: Pick<CartLine, "product_id" | "product_name" | "unit_price"> & {
      variant_id: string | null;
      variant_name?: string | null;
    },
  ) => void;
  clearCart: () => void;
  pending: boolean;
};

const CartContext = createContext<CartContextValue | null>(null);

export function useStorefrontCart() {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error("Le bouton panier doit se trouver dans sa boutique.");
  }
  return context;
}

export function StorefrontCartProvider({
  cart: initialCart,
  isAuthenticated,
  shopId,
  shopName,
  shopSlug,
  children,
}: {
  cart: CartSnapshot;
  isAuthenticated: boolean;
  shopId: string;
  shopName: string;
  shopSlug: string;
  children: ReactNode;
}) {
  const [cart, setCart] = useState(initialCart);
  const [optimisticCart, setOptimisticCart] = useOptimistic(
    cart,
    (
      current,
      action:
        | { type: "add"; line: CartLine }
        | { type: "quantity"; itemId: string; quantity: number }
        | { type: "remove"; itemId: string },
    ) => {
      if (action.type === "add") {
        const existing = current.items.find(
          (line) =>
            line.product_id === action.line.product_id &&
            line.variant_id === action.line.variant_id,
        );
        if (existing) {
          return {
            ...current,
            items: current.items.map((line) =>
              line.item_id === existing.item_id
                ? { ...line, quantity: Math.min(99, line.quantity + 1) }
                : line,
            ),
            quantity: Math.min(99, current.quantity + 1),
          };
        }
        return {
          ...current,
          items: [action.line, ...current.items],
          quantity: current.quantity + 1,
        };
      }

      if (action.type === "quantity") {
        const existing = current.items.find(
          (line) => line.item_id === action.itemId,
        );
        if (!existing) return current;
        const items = current.items.map((line) =>
          line.item_id === action.itemId
            ? { ...line, quantity: action.quantity }
            : line,
        );
        return {
          ...current,
          items,
          quantity: current.quantity + action.quantity - existing.quantity,
        };
      }

      const removed = current.items.find(
        (line) => line.item_id === action.itemId,
      );
      return {
        ...current,
        items: current.items.filter((line) => line.item_id !== action.itemId),
        quantity: Math.max(0, current.quantity - (removed?.quantity ?? 0)),
      };
    },
  );
  const [pending, setPending] = useState(true);
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function loadCart() {
      try {
        let result: CartActionResult;
        let mergeFailed = false;
        if (isAuthenticated && initialCart.hasGuestCart) {
          result = await mergeGuestCartForShop(shopId);
          if (!result.success) {
            mergeFailed = true;
            setMessage(result.message);
            result = await loadCartForShop(shopId);
          }
        } else {
          result = await loadCartForShop(shopId);
        }

        if (!active) return;
        if (result.success) {
          setCart(result.cart);
          if (!mergeFailed) {
            setMessage(
              isAuthenticated && initialCart.hasGuestCart
                ? "Ton panier invité a été fusionné avec ton compte."
                : "",
            );
          }
        } else {
          setMessage(result.message);
        }
      } catch {
        if (active) {
          setMessage("Le panier n’a pas pu être chargé. Réessaie.");
        }
      } finally {
        if (active) setPending(false);
      }
    }

    void loadCart();

    return () => {
      active = false;
    };
  }, [initialCart.hasGuestCart, isAuthenticated, shopId]);

  const contextValue: CartContextValue = {
    pending,
    clearCart() {
      setCart({ items: [], quantity: 0, hasGuestCart: false });
    },
    addItem(item) {
      setPending(true);
      setMessage("");
      startTransition(async () => {
        setOptimisticCart({
          type: "add",
          line: {
            cart_id: "pending",
            item_id: `pending:${item.product_id}:${item.variant_id ?? "base"}`,
            product_id: item.product_id,
            variant_id: item.variant_id,
            product_name: item.product_name,
            variant_name: item.variant_name ?? null,
            quantity: 1,
            unit_price: item.unit_price,
            status: "available",
            can_order: true,
            stock_limited: false,
          },
        });
        try {
          const result = await addCartItem(
            shopId,
            item.product_id,
            item.variant_id,
            1,
          );
          if (result.success) {
            setCart(result.cart);
            setMessage(result.message);
            setIsOpen(true);
          } else {
            setMessage(result.message);
          }
        } catch {
          setMessage("La connexion a échoué. Vérifie ton réseau et réessaie.");
        } finally {
          setPending(false);
        }
      });
    },
  };

  async function changeQuantity(item: CartLine, quantity: number) {
    if (pending) return;
    setPending(true);
    setMessage("");
    startTransition(async () => {
      setOptimisticCart({ type: "quantity", itemId: item.item_id, quantity });
      try {
        const result = await setCartItemQuantity(
          shopId,
          item.item_id,
          quantity,
        );
        if (result.success) {
          setCart(result.cart);
          setMessage(result.message);
        } else {
          setMessage(result.message);
        }
      } catch {
        setMessage("La quantité n’a pas pu être modifiée. Réessaie.");
      } finally {
        setPending(false);
      }
    });
  }

  async function removeItem(item: CartLine) {
    if (pending) return;
    setPending(true);
    setMessage("");
    startTransition(async () => {
      setOptimisticCart({ type: "remove", itemId: item.item_id });
      try {
        const result = await removeCartItem(shopId, item.item_id);
        if (result.success) {
          setCart(result.cart);
          setMessage(result.message);
        } else {
          setMessage(result.message);
        }
      } catch {
        setMessage("L’article n’a pas pu être retiré. Réessaie.");
      } finally {
        setPending(false);
      }
    });
  }

  return (
    <CartContext.Provider value={contextValue}>
      <div className="storefront-cart-bar">
        <button
          aria-controls="storefront-cart-panel"
          aria-expanded={isOpen}
          className="storefront-cart-toggle"
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
              d="M3 4h2l2.1 10.2a2 2 0 0 0 2 1.6h7.8a2 2 0 0 0 1.9-1.4L21 8H6"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="1.8"
            />
            <circle cx="10" cy="20" r="1" fill="currentColor" />
            <circle cx="18" cy="20" r="1" fill="currentColor" />
          </svg>
          Panier <span>({optimisticCart.quantity})</span>
        </button>
      </div>

      {isOpen ? (
        <section
          aria-label={`Panier chez ${shopName}`}
          className="storefront-cart-panel"
          id="storefront-cart-panel"
        >
          <div className="storefront-cart-panel__header">
            <div>
              <p className="auth-eyebrow">{shopName}</p>
              <h2>Ton panier</h2>
            </div>
            <button
              aria-label="Fermer le panier"
              className="storefront-cart-close"
              onClick={() => setIsOpen(false)}
              type="button"
            >
              Fermer
            </button>
          </div>
          {pending && !optimisticCart.items.length ? (
            <p className="storefront-cart-empty">Chargement du panier…</p>
          ) : optimisticCart.items.length ? (
            <ul className="storefront-cart-list">
              {optimisticCart.items.map((item) => (
                <li key={item.item_id}>
                  <div className="storefront-cart-line">
                    <div>
                      <strong>{item.product_name}</strong>
                      {item.variant_name ? (
                        <span>{item.variant_name}</span>
                      ) : null}
                      <span>{formatPrice(item.unit_price)} l’unité</span>
                      {item.stock_limited ? (
                        <span>Stock suivi par la boutique</span>
                      ) : null}
                      {!item.can_order ? (
                        <span className="storefront-cart-unavailable">
                          Article momentanément indisponible
                        </span>
                      ) : null}
                    </div>
                    <div
                      aria-label={`Quantité de ${item.product_name}`}
                      className="storefront-cart-quantity"
                    >
                      <button
                        aria-label={`Diminuer ${item.product_name}`}
                        disabled={pending || item.quantity <= 1}
                        onClick={() =>
                          void changeQuantity(item, item.quantity - 1)
                        }
                        type="button"
                      >
                        −
                      </button>
                      <span>{item.quantity}</span>
                      <button
                        aria-label={`Augmenter ${item.product_name}`}
                        disabled={
                          pending || item.quantity >= 99 || !item.can_order
                        }
                        onClick={() =>
                          void changeQuantity(item, item.quantity + 1)
                        }
                        type="button"
                      >
                        +
                      </button>
                    </div>
                  </div>
                  <button
                    className="storefront-cart-remove"
                    disabled={pending}
                    onClick={() => void removeItem(item)}
                    type="button"
                  >
                    Retirer
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="storefront-cart-empty">
              Ton panier est vide. Parcours la vitrine pour choisir un article.
            </p>
          )}
          {message ? (
            <p className="storefront-cart-message" role="status">
              {message}
            </p>
          ) : null}
          <p className="storefront-cart-note">
            Le total sera calculé par la boutique au moment de la commande.
          </p>
          <Link
            className="storefront-cart-continue"
            href={`/${encodeURIComponent(shopSlug)}`}
            onClick={() => setIsOpen(false)}
          >
            Continuer mes achats
          </Link>
          {optimisticCart.items.length > 0 ? (
            <Link
              className="ui-button ui-button--primary storefront-cart-checkout"
              href={`/${encodeURIComponent(shopSlug)}/checkout`}
              onClick={() => setIsOpen(false)}
            >
              Passer la commande
            </Link>
          ) : null}
        </section>
      ) : null}

      {children}
    </CartContext.Provider>
  );
}

export function AddToCartButton({
  productId,
  productName,
  price,
  variantId,
  variantName,
  disabled = false,
}: {
  productId: string;
  productName: string;
  price: number;
  variantId: string | null;
  variantName?: string | null;
  disabled?: boolean;
}) {
  const { addItem, pending } = useStorefrontCart();
  return (
    <button
      className="ui-button ui-button--primary storefront-add-button"
      disabled={disabled || pending}
      onClick={() =>
        addItem({
          product_id: productId,
          product_name: productName,
          unit_price: price,
          variant_id: variantId,
          variant_name: variantName ?? null,
        })
      }
      type="button"
    >
      {pending ? "Patiente…" : "Ajouter au panier"}
    </button>
  );
}

function formatPrice(price: number) {
  return `${new Intl.NumberFormat("fr-FR").format(price)} FCFA`;
}
