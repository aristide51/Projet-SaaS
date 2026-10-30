"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";

const slides = [
  {
    id: "vitrine",
    title: "Votre commerce",
    accent: "en ligne.",
    description:
      "Présentez vos offres et recevez les demandes au même endroit.",
    image: "/images/hero-boutique.png",
    imageAlt:
      "Commerçante burkinabè présentant son ordinateur dans une boutique en ligne.",
    target: "#vitrine",
    linkLabel: "Voir la vitrine",
  },
  {
    id: "commandes",
    title: "Vos commandes",
    accent: "mieux suivies.",
    description: "Centralisez les commandes et suivez leur avancée.",
    image: "/images/hero-commandes.png",
    imageAlt:
      "Commerçant burkinabè consultant son téléphone et préparant un colis.",
    target: "#commandes",
    linkLabel: "Voir les commandes",
  },
  {
    id: "rendez-vous",
    title: "Vos rendez-vous",
    accent: "sans effort.",
    description: "Laissez vos clients choisir un créneau en ligne.",
    image: "/images/hero-rendez-vous.png",
    imageAlt:
      "Gérante de salon burkinabè tenant une tablette pour gérer ses rendez-vous.",
    target: "#rendez-vous",
    linkLabel: "Voir les rendez-vous",
  },
] as const;

const slideTransition = {
  duration: 0.55,
  ease: [0.22, 1, 0.36, 1] as const,
};

export function MarketingHeroCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [pointerInside, setPointerInside] = useState(false);
  const [focusInside, setFocusInside] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const activeSlide = slides[activeIndex] ?? slides[0]!;
  const paused = pointerInside || focusInside || prefersReducedMotion;

  useEffect(() => {
    if (paused) return;

    const timeoutId = window.setTimeout(() => {
      setActiveIndex((currentIndex) => (currentIndex + 1) % slides.length);
    }, 7800);

    return () => window.clearTimeout(timeoutId);
  }, [activeIndex, paused]);

  function moveSlide(direction: -1 | 1) {
    setActiveIndex(
      (currentIndex) =>
        (currentIndex + direction + slides.length) % slides.length,
    );
  }

  function handleBlur(event: React.FocusEvent<HTMLElement>) {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      setFocusInside(false);
    }
  }

  return (
    <section
      aria-label="Découvrez les solutions Faso Studio"
      aria-roledescription="carrousel"
      className="marketing-hero"
      onBlurCapture={handleBlur}
      onFocusCapture={() => setFocusInside(true)}
      onPointerEnter={() => setPointerInside(true)}
      onPointerLeave={() => setPointerInside(false)}
    >
      <div className="marketing-hero__visual" data-hero-art id="demonstration">
        <AnimatePresence initial={false} mode="sync">
          <m.div
            animate={{ opacity: 1, scale: 1 }}
            className="marketing-hero__image-slide"
            exit={{ opacity: 0, scale: 1.025 }}
            initial={{ opacity: 0, scale: 1.035 }}
            key={activeSlide.id}
            transition={
              prefersReducedMotion ? { duration: 0 } : slideTransition
            }
          >
            <Image
              alt={activeSlide.imageAlt}
              className="marketing-hero__image"
              fill
              preload={activeIndex === 0}
              sizes="100vw"
              src={activeSlide.image}
            />
          </m.div>
        </AnimatePresence>
        <span className="marketing-orbit" />
        <span className="marketing-orb marketing-orb--large" />
        <span className="marketing-orb marketing-orb--small" />
        <span className="marketing-orb marketing-orb--tiny" />
      </div>

      <div className="marketing-hero__copy">
        <div
          aria-live={focusInside ? "polite" : "off"}
          className="marketing-hero__content"
          id="hero-content"
        >
          <AnimatePresence initial={false} mode="wait">
            <m.div
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              initial={{ opacity: 0, y: 18 }}
              key={activeSlide.id}
              transition={
                prefersReducedMotion ? { duration: 0 } : slideTransition
              }
            >
              <h1 id="hero-title">
                {activeSlide.title}
                <br />
                <span>{activeSlide.accent}</span>
              </h1>
              <p className="marketing-hero__intro">{activeSlide.description}</p>
              <div className="marketing-hero__actions">
                <Link className="marketing-button" href="/auth/signup">
                  Créer ma boutique <span aria-hidden="true">→</span>
                </Link>
                <a className="marketing-text-link" href={activeSlide.target}>
                  {activeSlide.linkLabel} <span aria-hidden="true">↗</span>
                </a>
              </div>
            </m.div>
          </AnimatePresence>
        </div>

        <div
          aria-label="Navigation du carrousel"
          className="marketing-hero__controls"
          role="group"
        >
          <button
            aria-controls="hero-content"
            aria-label="Diapositive précédente"
            className="marketing-hero__control"
            onClick={() => moveSlide(-1)}
            type="button"
          >
            <span aria-hidden="true">←</span>
          </button>
          <span aria-hidden="true" className="marketing-hero__count">
            {String(activeIndex + 1).padStart(2, "0")}
            <span>/</span>
            {String(slides.length).padStart(2, "0")}
          </span>
          <div
            aria-label={`Diapositive ${activeIndex + 1} sur ${slides.length}`}
            aria-valuemax={slides.length}
            aria-valuemin={1}
            aria-valuenow={activeIndex + 1}
            className="marketing-hero__progress"
            role="progressbar"
          >
            <span
              style={{
                transform: `scaleX(${(activeIndex + 1) / slides.length})`,
              }}
            />
          </div>
          <button
            aria-controls="hero-content"
            aria-label="Diapositive suivante"
            className="marketing-hero__control"
            onClick={() => moveSlide(1)}
            type="button"
          >
            <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </section>
  );
}
