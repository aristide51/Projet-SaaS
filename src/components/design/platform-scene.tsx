"use client";

import { useReducedMotion } from "framer-motion";
import { lazy, Suspense, useCallback, useState } from "react";
import { useDeviceCompatibility } from "@/components/design/device-compatibility-gate";
import { HeroBrandScenes } from "@/components/design/hero-brand-scenes";
import heroOrbitAnimation from "@/components/design/hero-orbit-animation.json";

const ThreeScene = lazy(() => import("@/components/design/three-scene"));

export function PlatformScene() {
  const compatibility = useDeviceCompatibility();
  const prefersReducedMotion = useReducedMotion();
  const [threeUnavailable, setThreeUnavailable] = useState(false);
  const onThreeUnavailable = useCallback(() => setThreeUnavailable(true), []);

  return (
    <div className="platform-scene">
      <div aria-hidden="true" className="platform-scene__fallback" />
      {compatibility === "ready" && (
        <Suspense fallback={null}>
          <ThreeScene onUnavailable={onThreeUnavailable} />
        </Suspense>
      )}
      <div aria-hidden="true" className="platform-scene__lottie">
        <LottieOrbit play={prefersReducedMotion !== true} />
      </div>
      {threeUnavailable && (
        <p className="platform-scene__status" role="status">
          L’illustration 3D est désactivée sur ce navigateur.
        </p>
      )}
      {compatibility === "ready" && <HeroBrandScenes />}
    </div>
  );
}

function LottieOrbit({ play }: Readonly<{ play: boolean }>) {
  return (
    <OrbitAnimation
      src={heroOrbitAnimation}
      autoplay={play}
      loop={play}
      renderer="svg"
    />
  );
}

const OrbitAnimation = lazy(() =>
  import("lottie-react").then((module) => ({
    default: module.Lottie,
  })),
);
