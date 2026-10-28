"use client";

import { useEffect, useRef } from "react";

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
            gsap.fromTo(
              element.children,
              { autoAlpha: 0, y: 16 },
              {
                autoAlpha: 1,
                y: 0,
                duration: 0.35,
                stagger: 0.08,
                ease: "power2.out",
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
    <div className="marketing-motion" ref={rootRef}>
      {children}
    </div>
  );
}
