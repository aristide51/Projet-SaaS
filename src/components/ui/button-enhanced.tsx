'use client';

import * as React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'amber';
type ButtonSize = 'sm' | 'md' | 'lg' | 'cta';

const baseClasses =
  'inline-flex items-center justify-center gap-2 rounded-md font-semibold ' +
  'transition-all duration-200 active:scale-95 focus-visible:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 ' +
  'disabled:pointer-events-none';

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[#155d42] text-white hover:bg-[#0f4a35] hover:shadow-lg hover:shadow-green-500/25 focus-visible:ring-green-500/50',
  secondary:
    'bg-white border border-[#b8c8bc] text-[#1e2c24] hover:bg-[#f0f4ed] hover:border-[#155d42] focus-visible:ring-[#155d42]/50',
  ghost: 'text-[#1e2c24] hover:bg-[#f0f4ed]',
  danger:
    'bg-[#a3312b] text-white hover:bg-[#8a2a24] hover:shadow-lg hover:shadow-red-500/25 focus-visible:ring-red-500/50',
  outline:
    'border border-[#155d42] text-[#155d42] hover:bg-[#155d42] hover:text-white focus-visible:ring-[#155d42]/50',
  amber:
    'bg-[#f59e0b] text-white hover:bg-[#d97706] hover:shadow-lg hover:shadow-amber-500/25 focus-visible:ring-amber-500/50',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-6 text-base',
  cta: 'h-12 px-8 text-base font-bold',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', asChild = false, ...props }, ref) => {
    const Comp = asChild ? React.Fragment : 'button';
    return (
      <Comp
        ref={ref as never}
        className={[baseClasses, variantClasses[variant], sizeClasses[size], className].filter(Boolean).join(' ')}
        {...props}
      />
    );
  },
);

Button.displayName = 'Button';

export { Button };