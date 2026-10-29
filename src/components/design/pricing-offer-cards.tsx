"use client";

import Link from "next/link";
import { m, useReducedMotion } from "framer-motion";

type PricingOffer = Readonly<{
  code: string;
  name: string;
  formattedPrice: string;
  isFree: boolean;
  description: string;
  benefits: string[];
  cta: string;
  featured: boolean;
}>;

type ArtworkVariant = 0 | 1 | 2;

const cardBackgrounds = ["#4f46e5", "#9333ea", "#be185d"] as const;
const cardTransition = { duration: 1, ease: "backInOut" } as const;
const cardVariants = { hover: { scale: 1.05, zIndex: 2 } };
const priceVariants = { hover: { scale: 1 } };

export function PricingOfferCards({
  offers,
}: Readonly<{ offers: PricingOffer[] }>) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <div className="pricing-offer-grid" data-stagger="offers">
      {offers.map((offer, index) => (
        <div className="pricing-offer-card-motion" key={offer.code}>
          <m.article
            aria-labelledby={`pricing-offer-${offer.code}`}
            className="pricing-offer-card"
            style={{
              backgroundColor: cardBackgrounds[index % cardBackgrounds.length],
            }}
            transition={cardTransition}
            variants={cardVariants}
            {...(prefersReducedMotion ? {} : { whileHover: "hover" })}
          >
            <PricingOfferArtwork variant={(index % 3) as ArtworkVariant} />
            <div className="pricing-offer-card__body">
              <div className="pricing-offer-card__heading">
                <h3
                  className="pricing-offer-card__name"
                  id={`pricing-offer-${offer.code}`}
                >
                  {offer.name}
                </h3>
                {offer.featured && (
                  <span className="pricing-offer-card__featured">
                    Pour grandir
                  </span>
                )}
              </div>
              <p className="pricing-offer-card__price">
                <m.span
                  className="pricing-offer-card__amount"
                  initial={prefersReducedMotion ? false : { scale: 0.9 }}
                  transition={cardTransition}
                  variants={priceVariants}
                >
                  {offer.isFree ? "Gratuit" : offer.formattedPrice}
                </m.span>
                {!offer.isFree && (
                  <span className="pricing-offer-card__unit">
                    FCFA <span>/ mois</span>
                  </span>
                )}
              </p>
              <p className="pricing-offer-card__description">
                {offer.description}
              </p>
              <ul className="pricing-offer-card__benefits">
                {offer.benefits.map((benefit, benefitIndex) => (
                  <li key={`${offer.code}-${benefitIndex}`}>
                    <span aria-hidden="true">✓</span>
                    {benefit}
                  </li>
                ))}
              </ul>
            </div>
            <Link className="pricing-offer-card__cta" href="/auth/signup">
              {offer.cta}
              <span aria-hidden="true">→</span>
            </Link>
          </m.article>
        </div>
      ))}
    </div>
  );
}

function PricingOfferArtwork({
  variant,
}: Readonly<{ variant: ArtworkVariant }>) {
  return (
    <m.svg
      aria-hidden="true"
      className="pricing-offer-card__art"
      focusable="false"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 320 384"
      variants={{ hover: { scale: variant === 1 ? 1.08 : 1.25 } }}
      transition={cardTransition}
    >
      {variant === 0 && (
        <>
          <m.circle
            cx="160.5"
            cy="114.5"
            fill="rgba(0, 0, 0, 0.2)"
            r="101.5"
            transition={cardTransition}
            variants={{ hover: { scaleY: 0.5, y: -25 } }}
          />
          <m.ellipse
            cx="160.5"
            cy="265.5"
            fill="rgba(0, 0, 0, 0.2)"
            rx="101.5"
            ry="43.5"
            transition={{ ...cardTransition, delay: 0.2 }}
            variants={{ hover: { scaleY: 2.25, y: -25 } }}
          />
        </>
      )}
      {variant === 1 && (
        <>
          <m.rect
            height="153"
            rx="15"
            style={{ y: 12 }}
            width="153"
            x="14"
            fill="rgba(0, 0, 0, 0.2)"
            transition={{ ...cardTransition, delay: 0.2 }}
            variants={{ hover: { y: 219, rotate: 90, scaleX: 2 } }}
          />
          <m.rect
            height="153"
            rx="15"
            style={{ y: 219 }}
            width="153"
            x="155"
            fill="rgba(0, 0, 0, 0.2)"
            transition={{ ...cardTransition, delay: 0.2 }}
            variants={{ hover: { y: 12, rotate: 90, scaleX: 2 } }}
          />
        </>
      )}
      {variant === 2 && (
        <>
          <m.path
            d="M148.893 157.531C154.751 151.673 164.249 151.673 170.107 157.531L267.393 254.818C273.251 260.676 273.251 270.173 267.393 276.031L218.75 324.674C186.027 357.397 132.973 357.397 100.25 324.674L51.6068 276.031C45.7489 270.173 45.7489 260.676 51.6068 254.818L148.893 157.531Z"
            fill="rgba(0, 0, 0, 0.2)"
            transition={cardTransition}
            variants={{ hover: { y: -50 } }}
          />
          <m.path
            d="M148.893 99.069C154.751 93.2111 164.249 93.2111 170.107 99.069L267.393 196.356C273.251 202.213 273.251 211.711 267.393 217.569L218.75 266.212C186.027 298.935 132.973 298.935 100.25 266.212L51.6068 217.569C45.7489 211.711 45.7489 202.213 51.6068 196.356L148.893 99.069Z"
            fill="rgba(0, 0, 0, 0.2)"
            transition={{ ...cardTransition, delay: 0.1 }}
            variants={{ hover: { y: -50 } }}
          />
          <m.path
            d="M148.893 40.6066C154.751 34.7487 164.249 34.7487 170.107 40.6066L267.393 137.893C273.251 143.751 273.251 153.249 267.393 159.106L218.75 207.75C186.027 240.473 132.973 240.473 100.25 207.75L51.6068 159.106C45.7489 153.249 45.7489 143.751 51.6068 137.893L148.893 40.6066Z"
            fill="rgba(0, 0, 0, 0.2)"
            transition={{ ...cardTransition, delay: 0.2 }}
            variants={{ hover: { y: -50 } }}
          />
        </>
      )}
    </m.svg>
  );
}
