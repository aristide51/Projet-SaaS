"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

export function HeroAnimation() {
  const [reducedMotion, setReducedMotion] = useState(() => {
    if (typeof window === "undefined") {
      return true;
    }
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });
  const containerRef = useRef<HTMLDivElement>(null);
  const gsapContextRef = useRef<{ revert: () => void } | undefined>(undefined);
  const cancelledRef = useRef(false);

  useEffect(() => {
    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    async function initAnimations() {
      if (cancelledRef.current || reducedMotion) {
        return;
      }

      const [{ default: gsap }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelledRef.current) return;

      gsapContextRef.current = gsap.context(() => {
        const container = containerRef.current;
        if (!container) return;

        gsap.fromTo(
          container.querySelectorAll<HTMLElement>(".hero__line"),
          { autoAlpha: 0, y: 32 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.8,
            ease: "power3.out",
            stagger: 0.15,
          },
        );

        gsap.fromTo(
          container.querySelector<HTMLElement>(".hero__sub")!,
          { autoAlpha: 0, y: 16 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.7,
            ease: "power2.out",
            delay: 0.3,
          },
        );

        gsap.fromTo(
          container.querySelector<HTMLElement>(".hero__cta")!,
          { autoAlpha: 0, scale: 0.92 },
          {
            autoAlpha: 1,
            scale: 1,
            duration: 0.6,
            ease: "back.out(1.4)",
            delay: 0.7,
          },
        );

        gsap.to(
          container.querySelectorAll<HTMLElement>(".hero__float"),
          {
            y: -14,
            duration: 3,
            repeat: -1,
            yoyo: true,
            ease: "sine.inOut",
            stagger: 0.4,
          },
        );
      });
    }

    void initAnimations();

    function updateMotionPreference() {
      setReducedMotion(motionPreference.matches);
      if (motionPreference.matches) {
        gsapContextRef.current?.revert();
        gsapContextRef.current = undefined;
      } else if (!cancelledRef.current) {
        void initAnimations();
      }
    }

    motionPreference.addEventListener("change", updateMotionPreference);

    return () => {
      cancelledRef.current = true;
      motionPreference.removeEventListener("change", updateMotionPreference);
      gsapContextRef.current?.revert();
    };
  }, [reducedMotion]);

  return (
    <section ref={containerRef} className="hero" aria-labelledby="hero-titre">
      <div className="hero__content">
        <h1 id="hero-titre" className="hero__title">
          <span className="hero__line">Votre boutique,</span>
          <span className="hero__line">en ligne en quelques minutes.</span>
        </h1>
        <p className="hero__sub">
          Gérez votre catalogue, vos rendez-vous et encaissez par mobile money.
          Une plateforme pensée pour les commerces locaux du Burkina Faso.
        </p>
        <div className="hero__cta">
          <Link
            href="/auth/signup"
            className="hero__button hero__button--primary"
          >
            Créer ma boutique
          </Link>
          <Link
            href="/(shop)/exemple"
            className="hero__button hero__button--secondary"
          >
            Voir une vitrine
          </Link>
        </div>
      </div>
      {!reducedMotion && <div className="hero__scene" aria-hidden="true" />}
    </section>
  );
}