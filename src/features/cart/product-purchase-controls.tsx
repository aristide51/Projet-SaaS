"use client";

import { useState } from "react";
import { AddToCartButton } from "./storefront-cart";

type ProductVariantOption = {
  id: string;
  name: string;
  price: number | null;
  available: boolean;
};

export function ProductPurchaseControls({
  productId,
  productName,
  basePrice,
  productAvailable,
  variants,
}: {
  productId: string;
  productName: string;
  basePrice: number;
  productAvailable: boolean;
  variants: ProductVariantOption[];
}) {
  const [variantId, setVariantId] = useState("");
  const selectedVariant = variants.find((variant) => variant.id === variantId);
  const price = selectedVariant?.price ?? basePrice;
  const isAvailable =
    productAvailable && (!selectedVariant || selectedVariant.available);

  return (
    <div className="product-purchase-controls">
      {variants.length ? (
        <label className="product-variant-select">
          <span>Choisis une variante</span>
          <select
            value={variantId}
            onChange={(event) => setVariantId(event.target.value)}
          >
            <option value="">Sélectionner une variante</option>
            {variants.map((variant) => (
              <option
                disabled={!variant.available}
                key={variant.id}
                value={variant.id}
              >
                {variant.name}
                {variant.price !== null
                  ? ` — ${formatPrice(variant.price)}`
                  : ""}
                {!variant.available ? " — Indisponible" : ""}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <AddToCartButton
        disabled={!isAvailable || (variants.length > 0 && !selectedVariant)}
        price={price}
        productId={productId}
        productName={productName}
        variantId={selectedVariant ? selectedVariant.id : null}
        variantName={selectedVariant ? selectedVariant.name : null}
      />
    </div>
  );
}

function formatPrice(price: number) {
  return `${new Intl.NumberFormat("fr-FR").format(price)} FCFA`;
}
