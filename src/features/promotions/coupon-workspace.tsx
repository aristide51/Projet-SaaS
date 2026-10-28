"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { Database, Json } from "@/types/database";
import { saveCoupon } from "./actions";

type Coupon = Database["public"]["Tables"]["coupons"]["Row"];
type Product = Pick<
  Database["public"]["Tables"]["products"]["Row"],
  "id" | "name"
>;
type Category = Pick<
  Database["public"]["Tables"]["categories"]["Row"],
  "id" | "name"
>;

function scopeIds(scope: Json, key: "product_ids" | "category_ids") {
  if (typeof scope !== "object" || scope === null || Array.isArray(scope)) {
    return [];
  }
  const value = scope[key];
  return Array.isArray(value)
    ? value.filter((id): id is string => typeof id === "string")
    : [];
}

function localDate(value: string | null) {
  return value ? value.slice(0, 16) : "";
}

function dateValue(value: FormDataEntryValue | null) {
  return typeof value === "string" && value
    ? new Date(value).toISOString()
    : null;
}

export function CouponWorkspace({
  shopId,
  coupons,
  products,
  categories,
}: {
  shopId: string;
  coupons: Coupon[];
  products: Product[];
  categories: Category[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Coupon | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    const formData = new FormData(event.currentTarget);
    const value = Number(formData.get("value"));
    const maxUses = String(formData.get("maxUses") ?? "");
    const result = await saveCoupon({
      shopId,
      couponId: selected?.id ?? null,
      code: String(formData.get("code") ?? ""),
      type: String(formData.get("type") ?? ""),
      value,
      minAmount: Number(formData.get("minAmount") ?? 0),
      startsAt: dateValue(formData.get("startsAt")),
      endsAt: dateValue(formData.get("endsAt")),
      maxUses: maxUses ? Number(maxUses) : null,
      perCustomerLimit: Number(formData.get("perCustomerLimit") ?? 1),
      productIds: formData.getAll("productIds").map(String),
      categoryIds: formData.getAll("categoryIds").map(String),
      active: formData.get("active") === "on",
    });
    setBusy(false);
    if (!result.success) {
      setError(result.message);
      return;
    }
    setMessage(result.message);
    setSelected(null);
    router.refresh();
  }

  return (
    <div className="promotion-workspace">
      <section className="team-section">
        <h2>
          {selected ? `Modifier ${selected.code}` : "Créer une promotion"}
        </h2>
        <form
          className="promotion-form"
          key={selected?.id ?? "new"}
          onSubmit={submit}
        >
          <label>
            Code promo
            <input
              defaultValue={selected?.code ?? ""}
              maxLength={24}
              minLength={3}
              name="code"
              pattern="[A-Za-z0-9_-]{3,24}"
              required
            />
          </label>
          <label>
            Type de remise
            <select defaultValue={selected?.type ?? "percent"} name="type">
              <option value="percent">Pourcentage</option>
              <option value="fixed">Montant fixe (FCFA)</option>
            </select>
          </label>
          <label>
            Valeur
            <input
              defaultValue={selected?.value ?? 10}
              min={1}
              name="value"
              required
              type="number"
            />
          </label>
          <label>
            Minimum d’achat (FCFA)
            <input
              defaultValue={selected?.min_amount ?? 0}
              min={0}
              name="minAmount"
              required
              type="number"
            />
          </label>
          <label>
            Début (facultatif)
            <input
              defaultValue={localDate(selected?.starts_at ?? null)}
              name="startsAt"
              type="datetime-local"
            />
          </label>
          <label>
            Fin (facultatif)
            <input
              defaultValue={localDate(selected?.ends_at ?? null)}
              name="endsAt"
              type="datetime-local"
            />
          </label>
          <label>
            Nombre total d’utilisations (facultatif)
            <input
              defaultValue={selected?.max_uses ?? ""}
              min={1}
              name="maxUses"
              type="number"
            />
          </label>
          <label>
            Utilisations par client
            <input
              defaultValue={selected?.per_customer_limit ?? 1}
              min={1}
              name="perCustomerLimit"
              required
              type="number"
            />
          </label>
          <fieldset>
            <legend>Produits concernés (vide = tous les produits)</legend>
            {products.map((product) => (
              <label key={product.id}>
                <input
                  defaultChecked={scopeIds(
                    selected?.scope ?? {},
                    "product_ids",
                  ).includes(product.id)}
                  name="productIds"
                  type="checkbox"
                  value={product.id}
                />
                {product.name}
              </label>
            ))}
          </fieldset>
          <fieldset>
            <legend>Catégories concernées</legend>
            {categories.map((category) => (
              <label key={category.id}>
                <input
                  defaultChecked={scopeIds(
                    selected?.scope ?? {},
                    "category_ids",
                  ).includes(category.id)}
                  name="categoryIds"
                  type="checkbox"
                  value={category.id}
                />
                {category.name}
              </label>
            ))}
          </fieldset>
          <label className="promotion-form__active">
            <input
              defaultChecked={selected?.active ?? true}
              name="active"
              type="checkbox"
            />
            Promotion active
          </label>
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
          <div className="promotion-form__actions">
            <button className="ui-button ui-button--primary" disabled={busy}>
              {busy ? "Enregistrement…" : "Enregistrer"}
            </button>
            {selected ? (
              <button
                className="ui-button ui-button--secondary"
                onClick={() => setSelected(null)}
                type="button"
              >
                Annuler la modification
              </button>
            ) : null}
          </div>
        </form>
      </section>

      <section className="team-section">
        <h2>Codes existants</h2>
        {coupons.length ? (
          <ul className="promotion-list">
            {coupons.map((coupon) => (
              <li key={coupon.id}>
                <div>
                  <strong>{coupon.code}</strong>
                  <span>
                    {coupon.type === "percent"
                      ? `${coupon.value} %`
                      : `${new Intl.NumberFormat("fr-FR").format(coupon.value)} FCFA`}
                    {" · "}
                    {coupon.active ? "Actif" : "Inactif"}
                    {" · "}
                    {coupon.used_count} utilisation(s)
                  </span>
                </div>
                <button
                  className="ui-button ui-button--secondary"
                  onClick={() => {
                    setSelected(coupon);
                    setError("");
                    setMessage("");
                  }}
                  type="button"
                >
                  Modifier
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p>Aucun code promotionnel créé.</p>
        )}
      </section>
    </div>
  );
}
