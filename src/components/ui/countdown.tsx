'use client';

import * as React from 'react';

interface CountdownProps {
  targetDate: Date;
  label?: string;
  className?: string;
}

/**
 * Compte à rebours style FasoCode-X ("-- jours -- heures -- min -- sec")
 */
export function Countdown({ targetDate, label = 'Prochaine rentrée', className }: CountdownProps) {
  const [timeLeft, setTimeLeft] = React.useState<{
    days: number;
    hours: number;
    minutes: number;
    seconds: number;
  } | null>(null);

  React.useEffect(() => {
    const update = () => {
      const now = new Date().getTime();
      const distance = targetDate.getTime() - now;

      if (distance < 0) {
        setTimeLeft(null);
        return;
      }

      const days = Math.floor(distance / (1000 * 60 * 60 * 24));
      const hours = Math.floor(
        (distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
      );
      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);

      setTimeLeft({ days, hours, minutes, seconds });
    };

    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [targetDate]);

  if (!timeLeft) {
    return (
      <div
        className={['flex items-center gap-2 text-[#a3312b] font-medium ' + className].filter(Boolean).join(' ')}
      >
        La session a démarré
      </div>
    );
  }

  return (
    <div
      className={[
        'flex flex-wrap items-center gap-3',
        'border border-[#dce5dc] rounded-xl bg-[#f0f4ed] px-4 py-3',
        className,
      ].filter(Boolean).join(' ')}
    >
      <span className="text-xs font-medium text-[#58695e] uppercase tracking-wider">
        {label}
      </span>
      <div className="flex gap-2">
        <CountdownUnit value={timeLeft.days} label="jours" />
        <span className="text-[#58695e]">:</span>
        <CountdownUnit value={timeLeft.hours} label="heures" />
        <span className="text-[#58695e]">:</span>
        <CountdownUnit value={timeLeft.minutes} label="min" />
        <span className="text-[#58695e]">:</span>
        <CountdownUnit value={timeLeft.seconds} label="sec" />
      </div>
    </div>
  );
}

function CountdownUnit({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-lg font-bold text-[#1e2c24] font-[Manrope]">
        {String(value).padStart(2, '0')}
      </span>
      <span className="text-[0.65rem] font-medium text-[#58695e] uppercase tracking-wider">
        {label}
      </span>
    </div>
  );
}