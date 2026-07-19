/**
 * AI platform logo strip for the landing hero — the engines GEO-Pulse helps you show up in.
 * Inline SVG brand marks + wordmarks (no external assets, CSP-safe). Swap in official brand
 * files under /public/media/logos and replace the icon bodies if you want pixel-perfect marks.
 */

function ChatGptMark({ className }: { className?: string }) {
  // OpenAI logomark.
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M22.28 9.82a5.98 5.98 0 0 0-.52-4.91 6.05 6.05 0 0 0-6.51-2.9A6.07 6.07 0 0 0 4.98 4.18a5.98 5.98 0 0 0-3.99 2.9 6.05 6.05 0 0 0 .74 7.1 5.98 5.98 0 0 0 .51 4.91 6.05 6.05 0 0 0 6.52 2.9A5.98 5.98 0 0 0 13.26 22a6.05 6.05 0 0 0 5.77-4.19 5.99 5.99 0 0 0 3.99-2.9 6.05 6.05 0 0 0-.74-7.1Zm-9.02 12.6a4.48 4.48 0 0 1-2.88-1.04l.14-.08 4.78-2.76a.78.78 0 0 0 .39-.68v-6.74l2.02 1.17a.07.07 0 0 1 .04.05v5.58a4.5 4.5 0 0 1-4.49 4.49ZM3.6 18.3a4.47 4.47 0 0 1-.54-3.01l.14.09 4.78 2.76a.78.78 0 0 0 .78 0l5.84-3.37v2.33a.08.08 0 0 1-.03.06L9.74 22a4.5 4.5 0 0 1-6.14-3.7Zm-1.26-10.4a4.48 4.48 0 0 1 2.34-1.97V11.6a.78.78 0 0 0 .39.68l5.84 3.37-2.02 1.17a.07.07 0 0 1-.07 0l-4.83-2.79A4.5 4.5 0 0 1 2.34 7.9Zm16.6 3.86-5.84-3.37 2.02-1.17a.07.07 0 0 1 .07 0l4.83 2.79a4.49 4.49 0 0 1-.68 8.1v-5.67a.78.78 0 0 0-.4-.68Zm2.01-3.02-.14-.09-4.78-2.76a.78.78 0 0 0-.78 0L9.4 7.26V4.93a.08.08 0 0 1 .03-.06l4.83-2.79a4.49 4.49 0 0 1 6.67 4.65ZM8.3 12.86l-2.02-1.17a.07.07 0 0 1-.04-.05V6.06a4.49 4.49 0 0 1 7.37-3.45l-.14.08-4.78 2.76a.78.78 0 0 0-.39.68Zm1.1-2.37L12 8.98l2.6 1.5v3l-2.6 1.5-2.6-1.5Z" />
    </svg>
  );
}

function GeminiMark({ className }: { className?: string }) {
  // Four-point sparkle with the Gemini blue→purple→pink gradient.
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <defs>
        <linearGradient id="gp-gemini" x1="2" y1="4" x2="22" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#4285F4" />
          <stop offset="0.5" stopColor="#9B72CB" />
          <stop offset="1" stopColor="#D96570" />
        </linearGradient>
      </defs>
      <path
        d="M12 1.5c.5 5.6 4.9 10 10.5 10.5-5.6.5-10 4.9-10.5 10.5-.5-5.6-4.9-10-10.5-10.5C7.1 11.5 11.5 7.1 12 1.5Z"
        fill="url(#gp-gemini)"
      />
    </svg>
  );
}

function ClaudeMark({ className }: { className?: string }) {
  // Anthropic sunburst — radiating tapered rays.
  const rays = Array.from({ length: 12 }, (_, i) => i * 30);
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className}>
      <g stroke="#D97757" strokeWidth="1.9" strokeLinecap="round">
        {rays.map((deg) => (
          <line key={deg} x1="12" y1="12" x2="12" y2="3.2" transform={`rotate(${deg} 12 12)`} />
        ))}
      </g>
    </svg>
  );
}

function PerplexityMark({ className }: { className?: string }) {
  // Perplexity mark — interlocking offset paths (teal).
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="none" stroke="#20A4B5" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18" />
      <path d="M12 6.5 5.5 3v7.5L12 14l6.5-3.5V3L12 6.5Z" />
      <path d="M5.5 13.5 12 17l6.5-3.5V21L12 17.5 5.5 21v-7.5Z" />
    </svg>
  );
}

function GroqMark({ className }: { className?: string }) {
  // Lightning bolt (Groq).
  return (
    <svg viewBox="0 0 24 24" aria-hidden className={className} fill="currentColor">
      <path d="M13.6 2 5 13.2h5.2L9.2 22 19 9.6h-5.6L13.6 2Z" />
    </svg>
  );
}

const wordmark = 'font-sans text-sm font-bold tracking-tight';

const PLATFORMS = [
  { name: 'ChatGPT', mark: ChatGptMark, className: 'text-on-background', word: <span className={`${wordmark} text-on-background`}>ChatGPT</span> },
  { name: 'Gemini', mark: GeminiMark, className: '', word: <span className={`${wordmark} text-on-background`}>Gemini</span> },
  { name: 'Claude', mark: ClaudeMark, className: '', word: <span className="font-headline text-base font-semibold text-on-background">Claude</span> },
  { name: 'Perplexity', mark: PerplexityMark, className: '', word: <span className={`${wordmark} text-on-background`}>perplexity</span> },
  { name: 'Groq', mark: GroqMark, className: 'text-on-background', word: <span className={`${wordmark} lowercase text-on-background`}>groq</span> },
] as const;

export function AiPlatformLogos() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-4">
      {PLATFORMS.map(({ name, mark: Mark, className }, i) => (
        <span key={name} className="inline-flex items-center gap-2 opacity-90 transition hover:opacity-100">
          <Mark className={`h-6 w-6 ${className}`} />
          {PLATFORMS[i]?.word}
        </span>
      ))}
    </div>
  );
}
