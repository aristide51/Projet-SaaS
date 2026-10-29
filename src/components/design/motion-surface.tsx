"use client";

import { m, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

export function MotionSurface({
  children,
  className,
}: Readonly<{ children: ReactNode; className: string }>) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <m.div
      className={className}
      transition={{ type: "spring", stiffness: 280, damping: 24 }}
      {...(prefersReducedMotion ? {} : { whileHover: { y: -8, scale: 1.015 } })}
    >
      {children}
    </m.div>
  );
}
