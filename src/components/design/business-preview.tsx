"use client";

import { useState } from "react";

const businessTypes = [
  {
    label: "Boutique",
    title: "Une vitrine à partager",
    description: "Produits et services en ligne.",
    firstLabel: "Votre offre",
    firstValue: "Catalogue",
    secondLabel: "Demandes",
    secondValue: "Commandes",
    notice: "Nouvelle commande",
  },
  {
    label: "Garage",
    title: "Vos services en ligne",
    description: "Retrouvez les demandes au même endroit.",
    firstLabel: "Votre activité",
    firstValue: "Services",
    secondLabel: "Demandes",
    secondValue: "Suivies",
    notice: "Nouvelle demande",
  },
  {
    label: "Salon",
    title: "Un agenda bien organisé",
    description: "Services et réservations en ligne.",
    firstLabel: "Vos services",
    firstValue: "Horaires",
    secondLabel: "Votre agenda",
    secondValue: "Réservations",
    notice: "Nouveau rendez-vous",
  },
] as const;

export function BusinessPreview() {
  const [activeIndex, setActiveIndex] = useState(0);
  const business = businessTypes[activeIndex];

  if (!business) return null;

  return (
    <div className="business-preview">
      <div
        aria-label="Choisir un exemple de métier"
        className="business-preview__tabs"
        role="group"
      >
        {businessTypes.map((type, index) => (
          <button
            aria-pressed={activeIndex === index}
            className="business-preview__tab"
            key={type.label}
            onClick={() => setActiveIndex(index)}
            type="button"
          >
            {type.label}
          </button>
        ))}
      </div>
      <article
        aria-live="polite"
        className="dashboard-preview"
        key={business.label}
      >
        <div className="dashboard-preview__top">
          <span className="dashboard-preview__brand">
            <span aria-hidden="true">F</span> Faso Studio
          </span>
          <span className="dashboard-preview__demo">Démo</span>
        </div>
        <div className="dashboard-preview__body">
          <p className="dashboard-preview__eyebrow">
            EXEMPLE POUR UNE {business.label.toLocaleUpperCase("fr-FR")}
          </p>
          <h2>{business.title}</h2>
          <p className="dashboard-preview__muted">{business.description}</p>
          <div className="dashboard-preview__stats">
            <div>
              <span>{business.firstLabel}</span>
              <strong>{business.firstValue}</strong>
            </div>
            <div>
              <span>{business.secondLabel}</span>
              <strong>{business.secondValue}</strong>
            </div>
          </div>
          <div className="dashboard-preview__order">
            <span aria-hidden="true" className="dashboard-preview__order-icon">
              ↗
            </span>
            <span>
              <strong>{business.notice}</strong>
              <small>Dans votre espace</small>
            </span>
          </div>
        </div>
        <div className="dashboard-preview__footer">
          <span>
            <i /> Une vitrine à votre image
          </span>
          <span>Faso Studio</span>
        </div>
      </article>
    </div>
  );
}
