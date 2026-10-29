/**
 * Design tokens inspirés de FasoCode-X et IObit
 * Adaptés pour le projet SaaS commerces locaux Burkina Faso
 */
export const designTokens = {
  primary: { 50: '#f0fdf4', 100: '#dcfce7', 500: '#22c55e', 600: '#16a34a', 700: '#15803d', 900: '#14532d' },
  amber: { 50: '#fffbeb', 100: '#fef3c7', 500: '#f59e0b', 600: '#d97706', 700: '#b45309', 900: '#78350f' },
  rose: { 50: '#fff1f2', 100: '#ffe4e6', 500: '#f43f5e', 600: '#e11d48', 700: '#be123c', 900: '#881337' },
  blue: { 50: '#eff6ff', 100: '#dbeafe', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 900: '#1e3a8a' },
  slate: { 50: '#f8fafc', 100: '#f1f5f9', 500: '#64748b', 600: '#475569', 900: '#0f172a' },
} as const;

export const animationTokens = {
  duration: { fast: '140ms', normal: '220ms', slow: '350ms', slower: '600ms' },
  ease: { standard: 'cubic-bezier(0.2, 0.7, 0.2, 1)', spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)', bounce: 'cubic-bezier(0.68, -0.55, 0.27, 1.55)' },
  stagger: { small: '60ms', normal: '100ms', large: '150ms' },
} as const;

export const breakpoints = { sm: '640px', md: '768px', lg: '1024px', xl: '1280px', '2xl': '1536px' } as const;