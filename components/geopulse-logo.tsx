'use client';

type GeoPulseLogoProps = {
  readonly className?: string;
  readonly size?: 'sm' | 'md' | 'lg';
};

const sizeClass: Record<NonNullable<GeoPulseLogoProps['size']>, string> = {
  sm: 'text-[0.78rem] sm:text-[0.84rem]',
  md: 'text-[0.92rem] sm:text-[1.02rem]',
  lg: 'text-[1.02rem] sm:text-[1.14rem]',
};

/**
 * Text-only GeoPulse wordmark in dark gold.
 */
export function GeoPulseLogo({ className, size = 'md' }: GeoPulseLogoProps) {
  return (
    <span
      className={`inline-flex items-center font-headline font-medium uppercase tracking-[0.22em] text-[#8F7338] ${sizeClass[size]} ${className ?? ''}`}
      aria-label="GEO-Pulse"
    >
      GEO-Pulse
    </span>
  );
}
