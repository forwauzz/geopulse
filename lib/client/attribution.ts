'use client';

const ANON_COOKIE = 'gp_anon_id';
const UTM_STORAGE_KEY = 'gp_utm';
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
const ANON_COOKIE_MAX_AGE_SEC = 365 * 24 * 60 * 60;

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match?.[1] ?? null;
}

/**
 * Create a first-party, pseudonymous browser identifier once and retain it for attribution.
 * This is deliberately not a fingerprint: it is a random UUID stored only in a first-party cookie.
 */
export function ensureAnonymousId(): string | null {
  const existing = getCookie(ANON_COOKIE);
  if (existing) return existing;
  if (typeof document === 'undefined' || typeof crypto?.randomUUID !== 'function') return null;

  const id = crypto.randomUUID();
  document.cookie = `${ANON_COOKIE}=${id}; Path=/; Max-Age=${ANON_COOKIE_MAX_AGE_SEC}; SameSite=Lax; Secure`;
  return getCookie(ANON_COOKIE) ?? id;
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
  ensureAnonymousId();
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
