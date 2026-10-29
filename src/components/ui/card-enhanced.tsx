'use client';

import * as React from 'react';

type CardVariant = 'default' | 'product' | 'elevated' | 'featured';

const baseClasses =
  'rounded-xl border border-[#dce5dc] bg-white shadow-sm ' +
  'transition-all duration-200 hover:shadow-md hover:border-[#b8c8bc]';

const variantClasses: Record<CardVariant, string> = {
  default: '',
  product:
    'rounded-lg border-[#dce5dc] bg-white shadow-sm hover:shadow-lg hover:border-[#155d42]/50',
  elevated:
    'rounded-2xl border-[#dce5dc] bg-white shadow-card hover:shadow-floating',
  featured:
    'rounded-2xl border-[#dce5dc] bg-white shadow-sm hover:shadow-lg relative overflow-hidden',
};

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: CardVariant;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(({ className, variant = 'default', ...props }, ref) => (
  <div
    ref={ref}
    className={[baseClasses, variantClasses[variant], className].filter(Boolean).join(' ')}
    {...props}
  />
));

Card.displayName = 'Card';

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={'flex flex-col space-y-1.5 p-6 ' + className} {...props} />
  ),
);
CardHeader.displayName = 'CardHeader';

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <h3
      ref={ref}
      className={
        'text-2xl font-semibold leading-none tracking-tight text-[#1e2c24] ' + className
      }
      {...props}
    />
  ),
);
CardTitle.displayName = 'CardTitle';

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={['text-sm text-[#58695e] ' + className].join(' ')}
    {...props}
  />
));
CardDescription.displayName = 'CardDescription';

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={'p-6 pt-0 ' + className} {...props} />
  ),
);
CardContent.displayName = 'CardContent';

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={'flex items-center p-6 pt-0 ' + className}
      {...props}
    />
  ),
);
CardFooter.displayName = 'CardFooter';

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter };