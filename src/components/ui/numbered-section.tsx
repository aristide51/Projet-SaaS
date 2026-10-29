"use client";

import * as React from "react";
import { useEffect, useRef } from "react";

interface NumberedSectionProps {
  number: string | number;
  title: string;
  description?: string;
  children?: React.ReactNode;
  className?: string;
}

/**
 * Section numérotée style FasoCode-X ("01 Intelligence artificielle & Data", "02 Cloud & DevOps")
 * Avec animations GSAP / ScrollTrigger
 */
export function NumberedSection({
  number,
  title,
  description,
  children,
  className,
}: NumberedSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const gsapContextRef = useRef<{ revert: () => void } | undefined>(undefined);
  const cancelledRef = useRef(false);

  useEffect(() => {
    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    if (motionPreference.matches) return;

    let active = true;

    async function initAnimations() {
      if (cancelledRef.current || !active) return;
      const container = containerRef.current;
      if (!container) return;

      const [{ default: gsap }, { ScrollTrigger }] = await Promise.all([
        import("gsap"),
        import("gsap/ScrollTrigger"),
      ]);
      if (cancelledRef.current || !active || !container) return;

      gsap.registerPlugin(ScrollTrigger);
      gsapContextRef.current = gsap.context(() => {
        gsap.fromTo(
          container.querySelectorAll<HTMLElement>(".numbered-badge"),
          { autoAlpha: 0, y: 20, scale: 0.5, rotation: -10 },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            rotation: 0,
            duration: 0.6,
            ease: "back.out(1.4)",
            scrollTrigger: { trigger: container, start: "top 85%", once: true },
          },
        );

        gsap.fromTo(
          container.querySelectorAll<HTMLElement>(".numbered-content"),
          { autoAlpha: 0, y: 20 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.6,
            delay: 0.15,
            ease: "power3.out",
            scrollTrigger: { trigger: container, start: "top 85%", once: true },
          },
        );
      }, container);
    }

    void initAnimations();

    function handlePreferenceChange() {
      if (motionPreference.matches) {
        active = false;
        gsapContextRef.current?.revert();
      }
    }

    motionPreference.addEventListener("change", handlePreferenceChange);

    return () => {
      cancelledRef.current = true;
      active = false;
      motionPreference.removeEventListener("change", handlePreferenceChange);
      gsapContextRef.current?.revert();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className={[
        "flex flex-col gap-4",
        "border-t border-[#dce5dc] pt-6",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="flex items-start gap-3">
        <span className="numbered-badge flex h-8 w-8 flex-none items-center justify-center rounded-md bg-[#155d42] font-[Manrope] text-lg font-bold text-white">
          {number}
        </span>
        <div className="numbered-content">
          <h3 className="text-lg leading-tight font-semibold text-[#1e2c24]">
            {title}
          </h3>
          {description && (
            <p className="mt-1 text-sm leading-relaxed text-[#58695e]">
              {description}
            </p>
          )}
        </div>
      </div>
      {children && <div className="mt-4">{children}</div>}
    </div>
  );
}
