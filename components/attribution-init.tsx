'use client';

import { useEffect } from 'react';
import { getAttributionContext, initAttribution } from '@/lib/client/attribution';

const SESSION_FIRED_KEY = 'gp_session_fired';

/** Fire session_started once per browser session (top-of-funnel visit), best-effort. */
function fireSessionStartedOnce(): void {
  try {
    if (sessionStorage.getItem(SESSION_FIRED_KEY)) return;
    sessionStorage.setItem(SESSION_FIRED_KEY, '1');
  } catch {
    // No sessionStorage (private mode / blocked) — skip rather than double-fire every navigation.
    return;
  }
  const ctx = getAttributionContext();
  void fetch('/api/attribution/session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ctx),
    keepalive: true,
  }).catch(() => {
    /* analytics is best-effort — never surface to the user */
  });
}

export function AttributionInit() {
  useEffect(() => {
    initAttribution();
    fireSessionStartedOnce();
  }, []);
  return null;
}
