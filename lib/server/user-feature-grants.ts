/**
 * Per-user feature grants (migration 050). A super-admin can grant a specific user access to an
 * opt-in feature without making them a platform admin. Fail-closed: any read error → not granted.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type UserFeatureKey = 'automation' | 'recurring_audits' | 'fix_agent' | 'verify_agent';

export const USER_FEATURE_KEYS: UserFeatureKey[] = [
  'automation',
  'recurring_audits',
  'fix_agent',
  'verify_agent',
];

export const USER_FEATURE_LABELS: Record<UserFeatureKey, { label: string; help: string }> = {
  automation: { label: 'Automation', help: 'Access the automation controls in their dashboard.' },
  recurring_audits: { label: 'Recurring audits', help: 'Schedule their site to be re-audited automatically.' },
  fix_agent: { label: 'Fix Agent', help: 'An AI agent that turns their audit into copy-paste fixes.' },
  verify_agent: {
    label: 'Verify Agent',
    help: 'Compare their last two audits of a site to show what a change actually did.',
  },
};

/** True if the user has an active grant for `feature`. */
export async function userHasFeature(
  supabase: SupabaseClient,
  userId: string,
  feature: UserFeatureKey
): Promise<boolean> {
  if (!userId) return false;
  try {
    const { data, error } = await supabase
      .from('user_feature_grants')
      .select('granted')
      .eq('user_id', userId)
      .eq('feature', feature)
      .maybeSingle();
    if (error || !data) return false;
    return Boolean(data.granted);
  } catch {
    return false;
  }
}

/** All granted feature keys for a user (for the dashboard to resolve in one query). */
export async function listUserFeatures(supabase: SupabaseClient, userId: string): Promise<Set<UserFeatureKey>> {
  const out = new Set<UserFeatureKey>();
  if (!userId) return out;
  try {
    const { data } = await supabase
      .from('user_feature_grants')
      .select('feature, granted')
      .eq('user_id', userId)
      .eq('granted', true);
    for (const row of (data ?? []) as { feature: string }[]) {
      if ((USER_FEATURE_KEYS as string[]).includes(row.feature)) out.add(row.feature as UserFeatureKey);
    }
  } catch {
    /* fail closed */
  }
  return out;
}

export type GrantAdminRow = { userId: string; email: string; features: UserFeatureKey[] };

/** Resolve a user id from an email (service-role). */
export async function findUserIdByEmail(supabase: SupabaseClient, email: string): Promise<string | null> {
  const clean = email.trim().toLowerCase();
  if (!clean) return null;
  const { data } = await supabase.from('users').select('id').eq('email', clean).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** Grant or revoke one feature for a user (upsert). */
export async function setUserFeatureGrant(
  supabase: SupabaseClient,
  userId: string,
  feature: UserFeatureKey,
  granted: boolean,
  grantedBy: string | null
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('user_feature_grants')
    .upsert(
      { user_id: userId, feature, granted, granted_by: grantedBy, updated_at: new Date().toISOString() },
      { onConflict: 'user_id,feature' }
    );
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Recent grants for the admin panel, joined to email. */
export async function listGrantedUsers(supabase: SupabaseClient): Promise<GrantAdminRow[]> {
  const { data } = await supabase
    .from('user_feature_grants')
    .select('user_id, feature, granted')
    .eq('granted', true);
  const rows = (data ?? []) as { user_id: string; feature: string }[];
  if (rows.length === 0) return [];
  const byUser = new Map<string, UserFeatureKey[]>();
  for (const r of rows) {
    if (!(USER_FEATURE_KEYS as string[]).includes(r.feature)) continue;
    const list = byUser.get(r.user_id) ?? [];
    list.push(r.feature as UserFeatureKey);
    byUser.set(r.user_id, list);
  }
  const ids = [...byUser.keys()];
  const { data: users } = await supabase.from('users').select('id, email').in('id', ids);
  const emailById = new Map<string, string>((users ?? []).map((u: { id: string; email: string }) => [u.id, u.email]));
  return ids.map((id) => ({ userId: id, email: emailById.get(id) ?? id, features: byUser.get(id) ?? [] }));
}
