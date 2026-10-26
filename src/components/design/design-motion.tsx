"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const ThreeScene = dynamic(() => import("./three-scene"), {
  ssr: false,
  loading: () => <div aria-hidden="true" className="scene-fallback" />,
});

type MotionRefs = {
  reveal: HTMLElement[];
  stagger: HTMLElement[];
};

export function DesignMotion() {
  const [reducedMotion, setReducedMotion] = useState(true);
  const refs = useRef<MotionRefs>({ reveal: [], stagger: [] });
  const contextRef = useRef<{ revert: () => void } | undefined>(undefined);
  const cancelledRef = useRef(false);

  useEffect(() => {
    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );

    async function animateOnScroll() {
      const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);

      if (cancelledRef.current || motionPreference.matches) {
        return;
      }

      contextRef.current?.revert();
      gsap.registerPlugin(ScrollTrigger);

      contextRef.current = gsap.context(() => {
        // Révélation simple des sections
        gsap.utils.toArray<HTMLElement>(`.design-reveal`).forEach((element) => {
          refs.current.reveal.push(element);
          gsap.fromTo(
            element,
            { autoAlpha: 0, y: 28 },
            {
              autoAlpha: 1,
              y: 0,
              duration: 0.7,
              ease: "power3.out",
              scrollTrigger: {
                trigger: element,
                start: "top 88%",
                once: true,
              },
            },
          );
        });

        // Stagger pour les listes de fonctionnalités
        gsap.utils.toArray<HTMLElement>(`.design-stagger`).forEach((element) => {
          refs.current.stagger.push(element);
          gsap.fromTo(
            element,
            { autoAlpha: 0, y: 20 },
            {
              autoAlpha: 1,
              y: 0,
              duration: 0.55,
              ease: "power2.out",
              stagger: 0.12,
              scrollTrigger: {
                trigger: element,
                start: "top 88%",
                once: true,
              },
            },
          );
        });

      });
    }

    function updateMotionPreference() {
      setReducedMotion(motionPreference.matches);

      if (motionPreference.matches) {
        contextRef.current?.revert();
        contextRef.current = undefined;
      } else {
        void animateOnScroll();
      }
    }

    updateMotionPreference();
    motionPreference.addEventListener("change", updateMotionPreference);

    return () => {
      cancelledRef.current = true;
      motionPreference.removeEventListener("change", updateMotionPreference);
      contextRef.current?.revert();
    };
  }, []);

  return (
    <div className="motion-showcase">
      <div className="motion-showcase__copy">
        <span className="eyebrow">Mouvement, avec mesure</span>
        <h3 className="design-reveal">Du relief, sans ralentir le quotidien.</h3>
        <p className="design-reveal">
          GSAP et ScrollTrigger guident le regard. Une scène Three.js légère
          souligne les moments clés — jamais les tâches du commerçant.
        </p>
      </div>
      <div className="motion-showcase__scene">
        {reducedMotion ? (
          <div aria-hidden="true" className="scene-fallback" />
        ) : (
          <ThreeScene />
        )}
        <span aria-hidden="true" className="motion-showcase__caption">
          WEBGL · CHARGÉ À LA DEMANDE
        </span>
      </div>
    </div>
  );
}
