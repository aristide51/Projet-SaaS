"use client";

import Image from "next/image";
import { useEffect, useState, useTransition } from "react";
import type { Json } from "@/types/database";
import { decideShopReview, setShopSuspension } from "./actions";

type ReviewChecklist = {
  identity: boolean;
  logo: boolean;
  photos: boolean;
  contact: boolean;
  catalog: boolean;
  terms: boolean;
};

export type AdminShop = {
  id: string;
  name: string;
  slug: string;
  category: string;
  description: string | null;
  logoUrl: string | null;
  createdAt: string;
  submittedAt: string | null;
  whatsapp: string | null;
  phone: string | null;
  city: string;
  district: string | null;
  address: string | null;
  ownerName: string;
  ownerPhone: string | null;
  products: {
    id: string;
    name: string;
    description: string | null;
    price: number;
    photos: string[];
  }[];
  services: {
    id: string;
    name: string;
    description: string | null;
    price: number;
  }[];
};

export type AdminAuditEntry = {
  id: string;
  actorId: string | null;
  shopId: string | null;
  action: string;
  entity: string;
  createdAt: string;
  metadata: Json;
};

type ApprovedShop = {
  id: string;
  name: string;
  slug: string;
  is_suspended: boolean;
};

const CHECKS: { key: keyof ReviewChecklist; label: string }[] = [
  { key: "identity", label: "Nom et identité vérifiés" },
  { key: "logo", label: "Logo contrôlé" },
  { key: "photos", label: "Photos du catalogue contrôlées" },
  { key: "contact", label: "Coordonnées vérifiées" },
  { key: "catalog", label: "Catalogue réel conforme (hors exemples)" },
  { key: "terms", label: "Conformité aux CGU vérifiée" },
];

const FCFA = new Intl.NumberFormat("fr-FR");

export function AdminWorkspace({
  shops,
  approvedShops,
  audit,
}: {
  shops: AdminShop[];
  approvedShops: ApprovedShop[];
  audit: AdminAuditEntry[];
}) {
  return (
    <div className="admin-workspace">
      <header className="admin-header">
        <p className="auth-eyebrow">Administration plateforme</p>
        <h1>Validation des boutiques</h1>
        <p>
          Contrôle les demandes, prends une décision et suis les actions dans le
          journal d’audit.
        </p>
      </header>

      <section aria-labelledby="pending-shops-heading">
        <div className="admin-section-heading">
          <div>
            <h2 id="pending-shops-heading">Demandes en attente</h2>
            <p>{shops.length} boutique(s) à examiner</p>
          </div>
        </div>
        {shops.length ? (
          <div className="admin-shop-list">
            {shops.map((shop) => (
              <ShopReviewCard key={shop.id} shop={shop} />
            ))}
          </div>
        ) : (
          <p className="admin-empty">Aucune demande en attente.</p>
        )}
      </section>

      <section aria-labelledby="approved-shops-heading">
        <h2 id="approved-shops-heading">Boutiques publiées</h2>
        {approvedShops.length ? (
          <div className="admin-approved-list">
            {approvedShops.map((shop) => (
              <SuspensionControl key={shop.id} shop={shop} />
            ))}
          </div>
        ) : (
          <p className="admin-empty">Aucune boutique publiée.</p>
        )}
      </section>

      <section aria-labelledby="audit-heading">
        <h2 id="audit-heading">Journal d’audit récent</h2>
        {audit.length ? (
          <div className="admin-audit-list">
            {audit.map((entry) => (
              <article className="admin-audit-entry" key={entry.id}>
                <strong>{formatAuditAction(entry.action)}</strong>
                <span>{entry.entity}</span>
                <span>{entry.shopId ?? "Plateforme"}</span>
                <span>
                  Admin {entry.actorId ? entry.actorId.slice(0, 8) : "système"}
                </span>
                {auditReason(entry.metadata) ? (
                  <span>{auditReason(entry.metadata)}</span>
                ) : null}
                <time dateTime={entry.createdAt}>
                  {formatDate(entry.createdAt)}
                </time>
              </article>
            ))}
          </div>
        ) : (
          <p className="admin-empty">Aucune action récente à afficher.</p>
        )}
      </section>
    </div>
  );
}

function ShopReviewCard({ shop }: { shop: AdminShop }) {
  const [checklist, setChecklist] = useState<ReviewChecklist>({
    identity: false,
    logo: false,
    photos: false,
    contact: false,
    catalog: false,
    terms: false,
  });
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [decisionSaved, setDecisionSaved] = useState(false);
  const [now, setNow] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const ageHours =
    now !== null && shop.submittedAt
      ? Math.max(0, (now - new Date(shop.submittedAt).getTime()) / 3_600_000)
      : 0;
  const isOverdue = ageHours >= 12;
  const allChecked = Object.values(checklist).every(Boolean);
  const category = shop.category.replaceAll("_", " ");

  useEffect(() => {
    const timeout = window.setTimeout(() => setNow(Date.now()), 0);
    const interval = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, []);

  function decide(approve: boolean) {
    setMessage("");
    startTransition(async () => {
      const result = await decideShopReview({
        shopId: shop.id,
        approve,
        reason,
        checklist: approve ? checklist : undefined,
      });
      setMessage(result.message);
      if (result.success && result.refresh !== false) {
        window.location.reload();
      } else if (result.success) {
        setDecisionSaved(true);
      }
    });
  }

  return (
    <article className="admin-shop-card">
      <header className="admin-shop-card__header">
        <div>
          <p className="auth-eyebrow">{category}</p>
          <h3>{shop.name}</h3>
          <p>
            Reçue le {formatDate(shop.submittedAt ?? shop.createdAt)} · par{" "}
            {shop.ownerName}
          </p>
        </div>
        <div className={isOverdue ? "admin-age is-overdue" : "admin-age"}>
          {isOverdue
            ? `Prioritaire · ${Math.floor(ageHours)} h`
            : `En attente · ${Math.max(0, Math.floor(ageHours))} h`}
        </div>
      </header>

      <div className="admin-shop-details">
        <section aria-label="Identité et coordonnées">
          <h4>Identité et coordonnées</h4>
          {shop.logoUrl ? (
            <Image
              alt={`Logo de ${shop.name}`}
              className="admin-shop-logo"
              height={96}
              src={shop.logoUrl}
              unoptimized
              width={96}
            />
          ) : (
            <p className="admin-missing">Logo absent</p>
          )}
          {shop.description ? <p>{shop.description}</p> : null}
          <dl>
            <dt>WhatsApp</dt>
            <dd>{shop.whatsapp ?? "Absent"}</dd>
            <dt>Téléphone</dt>
            <dd>{shop.phone ?? shop.ownerPhone ?? "Absent"}</dd>
            <dt>Adresse</dt>
            <dd>
              {[shop.address, shop.district, shop.city]
                .filter(Boolean)
                .join(", ")}
            </dd>
            <dt>Boutique</dt>
            <dd>/{shop.slug} (après approbation)</dd>
          </dl>
        </section>

        <section aria-label="Catalogue soumis">
          <h4>Catalogue réel</h4>
          {shop.products.length || shop.services.length ? (
            <ul className="admin-catalog-list">
              {shop.products.map((product) => (
                <li key={product.id}>
                  <strong>{product.name}</strong>
                  <span>{FCFA.format(product.price)} FCFA · Produit</span>
                  {product.description ? <p>{product.description}</p> : null}
                  {product.photos.length ? (
                    <div className="admin-product-photos">
                      {product.photos.map((photo, index) => (
                        <a
                          aria-label={`Photo ${index + 1} de ${product.name}`}
                          href={photo}
                          key={photo}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <Image
                            alt={`${product.name}, photo ${index + 1}`}
                            height={88}
                            src={photo}
                            unoptimized
                            width={88}
                          />
                        </a>
                      ))}
                    </div>
                  ) : (
                    <span className="admin-missing">Sans photo</span>
                  )}
                </li>
              ))}
              {shop.services.map((service) => (
                <li key={service.id}>
                  <strong>{service.name}</strong>
                  <span>{FCFA.format(service.price)} FCFA · Service</span>
                  {service.description ? <p>{service.description}</p> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="admin-missing">
              Aucun produit ou service réel ; les exemples ne sont pas inclus.
            </p>
          )}
        </section>
      </div>

      <fieldset className="admin-checklist">
        <legend>Fiche de contrôle avant décision</legend>
        {CHECKS.map(({ key, label }) => (
          <label key={key}>
            <input
              checked={checklist[key]}
              onChange={(event) =>
                setChecklist((current) => ({
                  ...current,
                  [key]: event.target.checked,
                }))
              }
              type="checkbox"
            />
            {label}
          </label>
        ))}
      </fieldset>

      <label className="admin-reason-field">
        Motif (obligatoire pour un refus)
        <textarea
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
          value={reason}
        />
      </label>
      <div className="admin-decision-actions">
        <button
          className="ui-button ui-button--primary"
          disabled={pending || decisionSaved || !allChecked}
          onClick={() => decide(true)}
          type="button"
        >
          Approuver la boutique
        </button>
        <button
          className="ui-button ui-button--secondary"
          disabled={pending || decisionSaved || reason.trim().length < 3}
          onClick={() => decide(false)}
          type="button"
        >
          Refuser avec motif
        </button>
      </div>
      {message ? (
        <p className="admin-action-message" role="status">
          {message}
        </p>
      ) : null}
    </article>
  );
}

function SuspensionControl({ shop }: { shop: ApprovedShop }) {
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();

  function toggleSuspension() {
    setMessage("");
    startTransition(async () => {
      const result = await setShopSuspension(
        shop.id,
        !shop.is_suspended,
        reason,
      );
      setMessage(result.message);
      if (result.success) window.location.reload();
    });
  }

  return (
    <article className="admin-approved-row">
      <div>
        <strong>{shop.name}</strong>
        <span>{shop.is_suspended ? "Suspendue" : "En ligne"}</span>
      </div>
      <label>
        Motif
        <input
          maxLength={500}
          onChange={(event) => setReason(event.target.value)}
          value={reason}
        />
      </label>
      <button
        className="ui-button ui-button--secondary ui-button--sm"
        disabled={pending || reason.trim().length < 3}
        onClick={toggleSuspension}
        type="button"
      >
        {shop.is_suspended ? "Réactiver" : "Suspendre"}
      </button>
      {message ? <span role="status">{message}</span> : null}
    </article>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Ouagadougou",
  }).format(new Date(value));
}

function formatAuditAction(action: string) {
  const labels: Record<string, string> = {
    "shop.submitted": "Boutique soumise",
    "shop.approved": "Boutique approuvée",
    "shop.rejected": "Boutique refusée",
    "shop.suspended": "Boutique suspendue",
    "shop.unsuspended": "Boutique réactivée",
  };
  return labels[action] ?? action;
}

function auditReason(metadata: Json) {
  if (
    typeof metadata === "object" &&
    metadata !== null &&
    !Array.isArray(metadata) &&
    typeof metadata.reason === "string"
  ) {
    return metadata.reason;
  }
  return null;
}
