'use client';

type GeoPulseLogoProps = {
  readonly className?: string;
  readonly size?: 'sm' | 'md' | 'lg';
};

const sizeClass: Record<NonNullable<GeoPulseLogoProps['size']>, string> = {
  sm: 'text-[0.8rem] sm:text-[0.85rem]',
  md: 'text-[0.95rem] sm:text-[1.05rem]',
  lg: 'text-[1.05rem] sm:text-[1.2rem]',
};

/**
 * Text-only GeoPulse wordmark in dark gold.
 */
export function GeoPulseLogo({ className, size = 'md' }: GeoPulseLogoProps) {
  return (
    <span
      className={`inline-flex items-center font-headline font-semibold uppercase tracking-[0.18em] text-[#9A7A3A] ${sizeClass[size]} ${className ?? ''}`}
      aria-label="GEO-Pulse"
    >
      GEO-Pulse
    </span>
  );
}
