"use client";

import { lazy, Suspense, useEffect, useRef, useState } from "react";

const Rive = lazy(() =>
  import("@rive-app/react-canvas").then((module) => ({
    default: module.default,
  })),
);
const Spline = lazy(() =>
  import("@splinetool/react-spline").then((module) => ({
    default: module.default,
  })),
);

const riveScene = process.env.NEXT_PUBLIC_RIVE_HERO_SCENE;
const splineScene = process.env.NEXT_PUBLIC_SPLINE_HERO_SCENE;

export function HeroBrandScenes() {
  const [isNearViewport, setIsNearViewport] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!riveScene && !splineScene) return;
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsNearViewport(true);
          observer.disconnect();
        }
      },
      { rootMargin: "160px" },
    );
    observer.observe(container);

    return () => observer.disconnect();
  }, []);

  if (!riveScene && !splineScene) return null;

  return (
    <div aria-hidden="true" className="hero-brand-scenes" ref={containerRef}>
      {isNearViewport && (
        <Suspense fallback={null}>
          {splineScene && (
            <Spline
              className="hero-brand-scenes__spline"
              renderOnDemand
              scene={splineScene}
            />
          )}
          {riveScene && (
            <Rive
              aria-hidden="true"
              className="hero-brand-scenes__rive"
              src={riveScene}
              stateMachine="Main"
            />
          )}
        </Suspense>
      )}
    </div>
  );
}
