"use client";

import { m, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

export function MotionSurface({
  children,
  className,
  lift = 8,
  hoverScale = 1.015,
  pressScale,
}: Readonly<{
  children: ReactNode;
  className: string;
  lift?: number;
  hoverScale?: number;
  pressScale?: number;
}>) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <m.div
      className={className}
      transition={{ type: "spring", stiffness: 280, damping: 24 }}
      {...(prefersReducedMotion
        ? {}
        : {
            whileHover: { y: -lift, scale: hoverScale },
            ...(pressScale ? { whileTap: { scale: pressScale } } : {}),
          })}
    >
      {children}
    </m.div>
  );
}
