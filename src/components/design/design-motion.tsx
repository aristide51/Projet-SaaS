"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const ThreeScene = dynamic(() => import("./three-scene"), {
  ssr: false,
  loading: () => <div aria-hidden="true" className="scene-fallback" />,
});

export function DesignMotion() {
  const [reducedMotion, setReducedMotion] = useState(true);

  useEffect(() => {
    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    let context: { revert: () => void } | undefined;
    let cancelled = false;

    async function animateOnScroll() {
      const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);

      if (cancelled || motionPreference.matches) {
        return;
      }

      context?.revert();
      gsap.registerPlugin(ScrollTrigger);
      context = gsap.context(() => {
        gsap.utils.toArray<HTMLElement>(".design-reveal").forEach((element) => {
          gsap.fromTo(
            element,
            { autoAlpha: 0, y: 22 },
            {
              autoAlpha: 1,
              y: 0,
              duration: 0.65,
              ease: "power2.out",
              scrollTrigger: {
                trigger: element,
                start: "top 86%",
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
        context?.revert();
        context = undefined;
      } else {
        void animateOnScroll();
      }
    }

    updateMotionPreference();
    motionPreference.addEventListener("change", updateMotionPreference);

    return () => {
      cancelled = true;
      motionPreference.removeEventListener("change", updateMotionPreference);
      context?.revert();
    };
  }, []);

  return (
    <div className="motion-showcase">
      <div className="motion-showcase__copy">
        <span className="eyebrow">Mouvement, avec mesure</span>
        <h3>Du relief, sans ralentir le quotidien.</h3>
        <p>
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
