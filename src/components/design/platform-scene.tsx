"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";

const ThreeScene = dynamic(() => import("./three-scene"), {
  ssr: false,
  loading: () => null,
});

export function PlatformScene() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (
      navigator as Navigator & {
        connection?: { saveData?: boolean };
      }
    ).connection;
    const memory = (
      navigator as Navigator & {
        deviceMemory?: number;
      }
    ).deviceMemory;
    const canvas = document.createElement("canvas");
    const canUseWebGL = Boolean(
      canvas.getContext("webgl") || canvas.getContext("experimental-webgl"),
    );

    if (
      !host ||
      preference.matches ||
      connection?.saveData ||
      (typeof memory === "number" && memory <= 4) ||
      !canUseWebGL
    ) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        performance.mark("marketing-scene-requested");
        setEnabled(true);
        observer.disconnect();
      },
      { rootMargin: "160px" },
    );
    const updateMotionPreference = () => {
      if (preference.matches) {
        setEnabled(false);
        observer.disconnect();
      } else {
        observer.observe(host);
      }
    };
    preference.addEventListener("change", updateMotionPreference);
    observer.observe(host);
    return () => {
      preference.removeEventListener("change", updateMotionPreference);
      observer.disconnect();
    };
  }, []);

  return (
    <div aria-hidden="true" className="platform-scene" ref={hostRef}>
      {enabled ? <ThreeScene /> : null}
      {!enabled ? <div className="platform-scene__fallback" /> : null}
    </div>
  );
}
