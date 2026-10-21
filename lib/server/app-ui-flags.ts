/**
 * Global UI visibility flags (super-admin App Settings panel, migration 049).
 *
 * Simple show/hide switches for whole app sections. Read on every page, so the read is cached
 * (`unstable_cache`, tag `app-ui-flags`) and backed by a public-readable table. Missing rows fall
 * back to code defaults, so the app renders sanely even before the migration is applied.
 */
import { unstable_cache, revalidateTag } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export type UiFlagKey =
  | 'show_pricing'
  | 'show_about_nav'
  | 'show_free_trial'
  | 'show_connectors'
  | 'show_billing'
  | 'show_blog'
  | 'show_competitor_search'
  | 'show_monitor_subscription';

export type UiFlags = Record<UiFlagKey, boolean>;

/** OSS-simplifying defaults — used when a row is absent (or the table isn't there yet). */
export const UI_FLAG_DEFAULTS: UiFlags = {
  show_pricing: false,
  show_about_nav: false,
  show_free_trial: false,
  show_connectors: false,
  show_billing: true,
  show_blog: true,
  // Off by default — competitor discovery is still mock/imperfect; opt in per deployment.
  show_competitor_search: false,
  // Off by default — turns on the $39/mo monitoring subscribe CTA + anonymous checkout (fail-closed
  // until Stripe live prices + a QC tax registration are configured).
  show_monitor_subscription: false,
};

export const UI_FLAG_LABELS: Record<UiFlagKey, { label: string; help: string }> = {
  show_pricing: { label: 'Pricing page', help: 'Show the Pricing page + nav link.' },
  show_about_nav: { label: 'About in top nav', help: 'Show About in the top nav (it always stays in the footer).' },
  show_free_trial: { label: '“Start free trial” button', help: 'Show the free-trial CTA in the header.' },
  show_connectors: { label: 'Connectors', help: 'Show the Connectors section in the dashboard.' },
  show_billing: { label: 'Billing', help: 'Show the Billing section in the dashboard.' },
  show_blog: { label: 'Blog', help: 'Show the Blog link.' },
  show_competitor_search: { label: 'Competitor search', help: 'Show the “compare against competitors” tool on the results scorecard.' },
  show_monitor_subscription: { label: 'Monitoring subscription', help: 'Show the $39/mo “monitor my site monthly” subscribe CTA on results + reports, and enable its checkout.' },
};

export const UI_FLAG_KEYS = Object.keys(UI_FLAG_DEFAULTS) as UiFlagKey[];
const UI_FLAGS_TAG = 'app-ui-flags';

async function readUiFlagsUncached(): Promise<UiFlags> {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) return { ...UI_FLAG_DEFAULTS };
  try {
    const supabase = createServiceRoleClient(url, key);
    const { data, error } = await supabase.from('app_ui_flags').select('key, enabled');
    if (error || !data) return { ...UI_FLAG_DEFAULTS };
    const map = new Map<string, boolean>(data.map((r: { key: string; enabled: boolean }) => [r.key, r.enabled]));
    const out = { ...UI_FLAG_DEFAULTS };
    for (const k of UI_FLAG_KEYS) if (map.has(k)) out[k] = Boolean(map.get(k));
    return out;
  } catch {
    return { ...UI_FLAG_DEFAULTS };
  }
}

/** Cached read (60s / tag-invalidated). Safe to call from any server component. */
export const loadUiFlags = unstable_cache(readUiFlagsUncached, ['app-ui-flags'], {
  tags: [UI_FLAGS_TAG],
  revalidate: 60,
});

/** Update one flag (service-role) and bust the cache so the change is immediate. */
export async function setUiFlag(key: UiFlagKey, enabled: boolean, updatedBy: string | null): Promise<{ ok: boolean; error?: string }> {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !serviceKey) return { ok: false, error: 'misconfigured' };
  const supabase = createServiceRoleClient(url, serviceKey);
  const { error } = await supabase
    .from('app_ui_flags')
    .upsert({ key, enabled, updated_by: updatedBy, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) return { ok: false, error: error.message };
  revalidateTag(UI_FLAGS_TAG);
  return { ok: true };
}
