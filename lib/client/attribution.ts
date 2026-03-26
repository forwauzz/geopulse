'use client';

const ANON_COOKIE = 'gp_anon_id';
const UTM_STORAGE_KEY = 'gp_utm';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1] ?? null;
}

export type AttributionContext = {
  anonymous_id: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  referrer_url: string | null;
  landing_path: string | null;
};

type StoredUtm = Partial<Record<(typeof UTM_KEYS)[number], string>>;

function captureUtmsFromUrl(): StoredUtm | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const found: StoredUtm = {};
  let hasAny = false;
  for (const key of UTM_KEYS) {
    const val = params.get(key);
    if (val) {
      found[key] = val;
      hasAny = true;
    }
  }
  return hasAny ? found : null;
}

function persistUtms(utms: StoredUtm): void {
  try {
    sessionStorage.setItem(UTM_STORAGE_KEY, JSON.stringify(utms));
  } catch { /* quota exceeded — non-critical */ }
}

function loadPersistedUtms(): StoredUtm {
  try {
    const raw = sessionStorage.getItem(UTM_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredUtm) : {};
  } catch {
    return {};
  }
}

/**
 * Capture UTMs on first load (from URL) and persist in sessionStorage.
 * Call once in a top-level layout or effect.
 */
export function initAttribution(): void {
  const fresh = captureUtmsFromUrl();
  if (fresh) {
    persistUtms(fresh);
  }
}

/**
 * Read current attribution context (anonymous_id from cookie, UTMs from sessionStorage).
 * Safe to call from any client component — returns nulls during SSR.
 */
export function getAttributionContext(): AttributionContext {
  const utms = loadPersistedUtms();
  return {
    anonymous_id: getCookie(ANON_COOKIE),
    utm_source: utms.utm_source ?? null,
    utm_medium: utms.utm_medium ?? null,
    utm_campaign: utms.utm_campaign ?? null,
    utm_content: utms.utm_content ?? null,
    utm_term: utms.utm_term ?? null,
    referrer_url: typeof document !== 'undefined' && document.referrer ? document.referrer : null,
    landing_path: typeof window !== 'undefined' ? window.location.pathname : null,
  };
}
