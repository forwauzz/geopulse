'use client';

import Image from 'next/image';

const LOGO_SRC = '/branding/geopulse-logo.png';

type GeoPulseLogoProps = {
  readonly className?: string;
  /** Tailwind height class; width follows aspect ratio */
  readonly size?: 'sm' | 'md' | 'lg';
};

const sizeClass: Record<NonNullable<GeoPulseLogoProps['size']>, string> = {
  sm: 'h-7 sm:h-8',
  md: 'h-8 sm:h-9',
  lg: 'h-9 sm:h-10',
};

/**
 * Gold GeoPulse wordmark on black — use on light surfaces or inside nav with sufficient padding.
 */
export function GeoPulseLogo({ className, size = 'md' }: GeoPulseLogoProps) {
  return (
    <span
      className={`relative inline-flex items-center overflow-hidden rounded-md bg-black ${sizeClass[size]} ${className ?? ''}`}
    >
      <Image
        src={LOGO_SRC}
        alt="GEO-Pulse wordmark"
        width={220}
        height={48}
        className="h-full w-auto max-w-[min(100%,220px)] object-contain object-center px-1.5 py-0.5"
        priority
        sizes="220px"
      />
    </span>
  );
}
