'use client';

import * as React from 'react';

interface CounterProps {
  value: string | number;
  label: string;
  suffix?: string;
  className?: string;
}

/**
 * Compteur style IObit ("20M+ Downloads", "0 M+ Satisfied Users")
 * Grand nombre + label dessous
 */
export function Counter({ value, label, suffix, className }: CounterProps) {
  return (
    <div
      className={[
        'flex flex-col items-start gap-1',
        className,
      ].filter(Boolean).join(' ')}
    >
      <span
        className={
          'text-4xl md:text-5xl font-extrabold tracking-tight text-[#1e2c24] font-[Manrope]'
        }
      >
        {value}{suffix}
      </span>
      <span className="text-sm font-medium text-[#58695e] uppercase tracking-wider">{label}</span>
    </div>
  );
}