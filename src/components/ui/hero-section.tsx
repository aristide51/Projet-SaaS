"use client";

import * as React from "react";
import { useEffect, useRef } from "react";

/**
 * Section Hero inspirée de FasoCode-X et IObit
 * - Titre grand, sous-titre clair (style IObit)
 * - CTA principal fort + CTA secondaire (style IObit Download Free / Get Pro)
 * - Badges de confiance et compteurs (style IObit "20M+ users")
 * - Animations GSAP / ScrollTrigger au scroll
 */
export function HeroSection({
  title,
  subtitle,
  primaryAction,
  secondaryAction,
  stats,
  badges,
}: {
  title: string;
  subtitle: string;
  primaryAction: { label: string; href: string };
  secondaryAction: { label: string; href: string };
  stats?: Array<{ value: string | number; label: string }>;
  badges?: string[];
}) {
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
          container.querySelectorAll<HTMLElement>(".hero-badge"),
          { autoAlpha: 0, y: 20, scale: 0.9 },
          {
            autoAlpha: 1,
            y: 0,
            scale: 1,
            duration: 0.6,
            stagger: 0.1,
            ease: "power3.out",
            scrollTrigger: { trigger: container, start: "top 85%", once: true },
          },
        );

        gsap.fromTo(
          container.querySelectorAll<HTMLElement>(".hero-title-line"),
          { autoAlpha: 0, y: 32 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.8,
            stagger: 0.15,
            ease: "power3.out",
            scrollTrigger: { trigger: container, start: "top 85%", once: true },
          },
        );

        gsap.fromTo(
          container.querySelector<HTMLElement>(".hero-sub")!,
          { autoAlpha: 0, y: 20 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.7,
            delay: 0.3,
            ease: "power2.out",
            scrollTrigger: { trigger: container, start: "top 85%", once: true },
          },
        );

        gsap.fromTo(
          container.querySelectorAll<HTMLElement>(".hero-cta"),
          { autoAlpha: 0, scale: 0.92 },
          {
            autoAlpha: 1,
            scale: 1,
            duration: 0.6,
            delay: 0.6,
            ease: "back.out(1.4)",
            scrollTrigger: { trigger: container, start: "top 85%", once: true },
          },
        );

        gsap.to(container.querySelectorAll<HTMLElement>(".hero-float"), {
          y: -14,
          duration: 3,
          repeat: -1,
          yoyo: true,
          ease: "sine.inOut",
          stagger: 0.4,
        });

        gsap.fromTo(
          container.querySelectorAll<HTMLElement>(".hero-stat"),
          { autoAlpha: 0, y: 20 },
          {
            autoAlpha: 1,
            y: 0,
            duration: 0.6,
            stagger: 0.12,
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
    <section
      ref={containerRef}
      className="relative overflow-hidden px-4 py-12 md:py-20"
    >
      <div
        className="hero-float absolute top-0 left-1/2 -z-10 h-[400px] w-[800px] -translate-x-1/2 -translate-y-20 rounded-full bg-amber-50/30 blur-3xl md:-translate-y-32"
        aria-hidden="true"
      />

      <div className="mx-auto max-w-5xl">
        {badges && badges.length > 0 && (
          <div className="mb-8 flex flex-wrap items-center gap-3">
            {badges.map((badge, i) => (
              <span
                key={i}
                className="hero-badge flex items-center gap-1.5 rounded-full border border-[#dce5dc] bg-white px-3 py-1.5 text-xs font-semibold text-[#58695e] shadow-sm"
                style={{ transitionDelay: `${i * 100}ms` }}
              >
                {badge}
              </span>
            ))}
          </div>
        )}

        <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
          <div className="flex flex-col gap-6">
            <h1 className="font-[Manrope] text-4xl leading-[1.1] font-extrabold tracking-tight text-[#1e2c24] md:text-6xl lg:text-7xl">
              <span className="hero-title-line block">{title}</span>
            </h1>
            <p className="hero-sub max-w-lg text-lg leading-relaxed text-[#58695e] md:text-xl">
              {subtitle}
            </p>
            <div className="flex flex-col gap-4 pt-4 sm:flex-row">
              <button className="cta hero-cta pulse-cta w-full bg-[#155d42] px-8 py-4 text-white transition-all duration-200 hover:bg-[#0f4a35] hover:shadow-lg hover:shadow-green-500/25 active:scale-95 sm:w-auto">
                {primaryAction.label}
              </button>
              <button className="md hero-cta h-12 w-full border border-[#b8c8bc] bg-white px-8 text-[#1e2c24] transition-all duration-200 hover:border-[#155d42] hover:bg-[#f0f4ed] active:scale-95 sm:w-auto">
                {secondaryAction.label}
              </button>
            </div>
          </div>

          <div className="hero-cta hidden lg:block">
            <div className="shadow-card hero-float relative overflow-hidden rounded-2xl border border-[#dce5dc] bg-white">
              <div className="/ 50 absolute inset-0 bg-[#f0f4ed]" />
              <div className="relative p-8">
                <div className="mb-6 flex items-center gap-3">
                  <div className="h-3 w-3 rounded-full bg-[#a3312b]" />
                  <div className="h-3 w-3 rounded-full bg-[#f59e0b]" />
                  <div className="h-3 w-3 rounded-full bg-[#155d42]" />
                </div>
                <div className="space-y-4">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-[#f0f4ed]" />
                  <div className="h-4 w-1/2 animate-pulse rounded bg-[#f0f4ed]" />
                  <div className="h-4 w-3/4 animate-pulse rounded bg-[#f0f4ed]" />
                  <div className="h-24 animate-pulse rounded-lg bg-[#f0f4ed]" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {stats && stats.length > 0 && (
          <div className="mt-16 grid grid-cols-2 gap-8 border-t border-[#dce5dc] pt-12 md:grid-cols-4">
            {stats.map((stat, i) => (
              <div
                key={i}
                className="hero-stat flex flex-col items-start gap-1"
                style={{ transitionDelay: `${(i + 1) * 100}ms` }}
              >
                <span className="font-[Manrope] text-3xl font-extrabold text-[#1e2c24] md:text-4xl">
                  {stat.value}
                </span>
                <span className="text-sm font-medium tracking-wider text-[#58695e] uppercase">
                  {stat.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
