"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, type ReactNode } from "react";
import { AmbientScene } from "./ambient-scene";

const REVEAL_SELECTOR = [
  "[data-reveal]",
  ".auth-card",
  ".auth-login-aside__content > *",
  ".auth-main__copy > *",
  ".auth-main__stat",
  ".account-header",
  ".quick-action",
  ".stat-card",
  ".account-section",
  ".account-footer",
  ".ui-card",
  ".ui-empty-state",
  ".dashboard-section",
  "main > section",
  "main > div > section",
].join(", ");

/**
 * Enveloppe commune des pages hors accueil : même thème, même scène
 * Three.js et mêmes animations GSAP (entrée progressive, révélation au
 * défilement en cascade) que la page d'accueil.
 */
export function SiteShell({
  children,
  className = "",
}: Readonly<{ children: ReactNode; className?: string }>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const root = rootRef.current;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!root || preference.matches) return;

    let active = true;
    let context: { revert: () => void } | undefined;

    async function initialize() {
      const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (!active || !root) return;
      gsap.registerPlugin(ScrollTrigger);

      context = gsap.context(() => {
        const topbar = root.querySelector<HTMLElement>(
          ".workspace-topbar, .public-storefront-toolbar",
        );
        if (topbar) {
          gsap.fromTo(
            topbar,
            { autoAlpha: 0, y: -18 },
            { autoAlpha: 1, y: 0, duration: 0.6, ease: "power3.out" },
          );
        }

        const candidates = Array.from(
          root.querySelectorAll<HTMLElement>(REVEAL_SELECTOR),
        );
        const candidateSet = new Set(candidates);
        const targets = candidates.filter((element) => {
          let parent = element.parentElement;
          while (parent && parent !== root) {
            if (candidateSet.has(parent)) return false;
            parent = parent.parentElement;
          }
          return true;
        });
        if (!targets.length) return;

        gsap.set(targets, {
          autoAlpha: 0,
          y: 30,
          scale: 0.97,
          rotationX: 6,
          transformPerspective: 900,
        });
        ScrollTrigger.batch(targets, {
          start: "top 92%",
          once: true,
          onEnter: (batch) =>
            gsap.to(batch, {
              autoAlpha: 1,
              y: 0,
              scale: 1,
              rotationX: 0,
              duration: 0.7,
              stagger: 0.1,
              ease: "power3.out",
              clearProps: "transform,transformPerspective",
            }),
        });
        ScrollTrigger.refresh();
      }, root);
    }

    void initialize();

    return () => {
      active = false;
      context?.revert();
    };
  }, [pathname]);

  return (
    <div className={`site-theme ${className}`} ref={rootRef}>
      <AmbientScene />
      <div className="site-theme__content">{children}</div>
    </div>
  );
}
