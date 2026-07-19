'use client';

import { useEffect } from 'react';

/**
 * Flight Story-style scroll reveal. Marks `<body>` with `.reveal-ready` (so the CSS in globals.css
 * only hides elements once JS is running — no FOUC / no-JS issues), then fades + slides any
 * `[data-reveal]` element up as it enters the viewport (once). Renders nothing.
 */
export function ScrollReveal() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'));
    if (els.length === 0) return;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    document.body.classList.add('reveal-ready');
    if (reduce || !('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('reveal-in'));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            const delay = el.dataset['revealDelay'];
            if (delay) el.style.transitionDelay = `${delay}ms`;
            el.classList.add('reveal-in');
            io.unobserve(el);
          }
        }
      },
      { rootMargin: '0px 0px -12% 0px', threshold: 0.12 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return null;
}
