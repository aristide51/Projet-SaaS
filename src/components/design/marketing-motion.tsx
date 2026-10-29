"use client";

import { useEffect, useRef } from "react";
import { domAnimation, LazyMotion } from "framer-motion";

export function MarketingMotion({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!root || preference.matches) return;

    let active = true;
    let context: { revert: () => void } | undefined;
    let scrollTrigger:
      typeof import("gsap/ScrollTrigger").ScrollTrigger | undefined;

    async function initialize() {
      const [{ default: gsap }, scrollTriggerModule] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (!active || preference.matches || !root) return;

      scrollTrigger = scrollTriggerModule.ScrollTrigger;
      gsap.registerPlugin(scrollTrigger);
      context = gsap.context(() => {
        const heroIntro = root.querySelector<HTMLElement>("[data-hero-intro]");
        const heroArt = root.querySelector<HTMLElement>("[data-hero-art]");
        const heroTimeline = gsap.timeline({
          defaults: { ease: "power3.out" },
        });

        if (heroIntro) {
          heroTimeline.fromTo(
            heroIntro.querySelectorAll(
              ".marketing-kicker, h1, .marketing-hero__intro, .marketing-hero__actions, .marketing-proof",
            ),
            { autoAlpha: 0, y: 22 },
            { autoAlpha: 1, y: 0, duration: 0.7, stagger: 0.1 },
          );
        }

        if (heroArt) {
          heroTimeline.fromTo(
            heroArt,
            { autoAlpha: 0, y: 28, scale: 0.97 },
            { autoAlpha: 1, y: 0, scale: 1, duration: 0.85 },
            heroIntro ? "-=0.55" : 0,
          );

          const hero = root.querySelector<HTMLElement>(".marketing-hero");
          if (hero) {
            gsap.fromTo(
              heroArt,
              { yPercent: 0 },
              {
                yPercent: 5,
                ease: "none",
                scrollTrigger: {
                  trigger: hero,
                  start: "top top",
                  end: "bottom top",
                  scrub: 0.6,
                },
              },
            );
          }
        }

        const stepSequence = root.querySelector<HTMLElement>(
          "[data-step-sequence]",
        );
        const stepProgress = stepSequence?.querySelector<HTMLElement>(
          "[data-step-progress]",
        );
        if (stepSequence && stepProgress) {
          gsap.fromTo(
            stepProgress,
            { scaleY: 0 },
            {
              scaleY: 1,
              ease: "none",
              scrollTrigger: {
                trigger: stepSequence,
                start: "top 72%",
                end: "bottom 58%",
                scrub: 0.45,
              },
            },
          );

          stepSequence
            .querySelectorAll<HTMLElement>(".step-list > li")
            .forEach((step) => {
              scrollTrigger?.create({
                trigger: step,
                start: "top 56%",
                end: "bottom 46%",
                toggleClass: { targets: step, className: "is-active" },
              });
            });
        }

        root
          .querySelectorAll<HTMLElement>("[data-reveal]")
          .forEach((element) => {
            gsap.fromTo(
              element,
              { autoAlpha: 0, y: 20 },
              {
                autoAlpha: 1,
                y: 0,
                duration: 0.4,
                ease: "power2.out",
                scrollTrigger: {
                  trigger: element,
                  start: "top 88%",
                  once: true,
                },
              },
            );
          });
        root
          .querySelectorAll<HTMLElement>("[data-stagger]")
          .forEach((element) => {
            const isBenefitGrid = element.dataset.stagger === "benefits";
            const isOfferGrid = element.dataset.stagger === "offers";
            const targets = isBenefitGrid
              ? element.querySelectorAll<HTMLElement>(".benefit-card")
              : element.children;
            gsap.fromTo(
              targets,
              {
                autoAlpha: 0,
                y: isBenefitGrid ? 34 : isOfferGrid ? 30 : 20,
                scale: isBenefitGrid ? 0.94 : isOfferGrid ? 0.96 : 0.97,
                rotationX: isBenefitGrid ? 7 : isOfferGrid ? 4 : 0,
              },
              {
                autoAlpha: 1,
                y: 0,
                scale: 1,
                rotationX: 0,
                duration: isBenefitGrid || isOfferGrid ? 0.65 : 0.5,
                stagger: isBenefitGrid || isOfferGrid ? 0.14 : 0.1,
                ease: "power3.out",
                scrollTrigger: {
                  trigger: element,
                  start: "top 88%",
                  once: true,
                },
              },
            );
          });
      }, root);

      root.querySelectorAll("img").forEach((image) => {
        if (image.complete) return;
        image.addEventListener("load", refreshAfterImage, { once: true });
        image.addEventListener("error", refreshAfterImage, { once: true });
      });
      scrollTrigger.refresh();
    }

    function refreshAfterImage() {
      if (active) scrollTrigger?.refresh();
    }

    function handlePreferenceChange() {
      if (preference.matches) {
        active = false;
        context?.revert();
      }
    }

    void initialize();
    preference.addEventListener("change", handlePreferenceChange);

    return () => {
      active = false;
      preference.removeEventListener("change", handlePreferenceChange);
      root.querySelectorAll("img").forEach((image) => {
        image.removeEventListener("load", refreshAfterImage);
        image.removeEventListener("error", refreshAfterImage);
      });
      context?.revert();
    };
  }, []);

  return (
    <LazyMotion features={domAnimation} strict>
      <div className="marketing-motion" ref={rootRef}>
        {children}
      </div>
    </LazyMotion>
  );
}
