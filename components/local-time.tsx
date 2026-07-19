'use client';

import { useEffect, useState } from 'react';

/**
 * Renders an ISO timestamp in the VIEWER's local timezone (with the tz abbreviation), so a user
 * on EST sees EST — not the server's UTC. Starts with a stable fallback for SSR, then localizes
 * on hydration to avoid a mismatch.
 */
export function LocalTime({ iso, fallback = '—' }: { iso: string | null | undefined; fallback?: string }) {
  const [text, setText] = useState<string>(fallback);
  useEffect(() => {
    if (!iso) {
      setText(fallback);
      return;
    }
    try {
      setText(
        new Date(iso).toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
          timeZoneName: 'short',
        })
      );
    } catch {
      setText(fallback);
    }
  }, [iso, fallback]);
  return <>{text}</>;
}
