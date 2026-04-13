'use client';

type GeoPulseLogoProps = {
  readonly className?: string;
  readonly size?: 'sm' | 'md' | 'lg';
};

const sizeClass: Record<NonNullable<GeoPulseLogoProps['size']>, string> = {
  sm: 'text-[0.76rem] sm:text-[0.82rem]',
  md: 'text-[0.9rem] sm:text-[1rem]',
  lg: 'text-[1rem] sm:text-[1.1rem]',
};

/**
 * Text-only GeoPulse wordmark in dark gold.
 */
export function GeoPulseLogo({ className, size = 'md' }: GeoPulseLogoProps) {
  return (
    <span
      className={`inline-flex items-center font-headline font-medium uppercase tracking-[0.16em] text-[#8A6D33] ${sizeClass[size]} ${className ?? ''}`}
      aria-label="GEO-Pulse"
    >
      GEO-Pulse
    </span>
  );
}
