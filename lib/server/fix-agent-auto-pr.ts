/**
 * "Open the pull request without asking me" — a per-user authorization for the Fix Agent.
 *
 * Stored in `user_feature_grants`, whose `feature` column is free text, so this needs no migration.
 * That table otherwise holds admin-assigned capabilities, which is why the setter below is
 * deliberately NOT the generic one:
 *
 *   `setUserFeatureGrant` can write ANY key and is admin-only. `setFixAgentAutoPr` hardcodes this
 *   one key, so a user toggling their own preference can never grant themselves `fix_agent`,
 *   `automation`, or anything else. The key is not a parameter — that is the whole point.
 *
 * Semantically this belongs here rather than in a preferences blob: it is not a display setting, it
 * is standing permission for an agent to write to someone's repository. Default off, and it only
 * ever authorizes opening a pull request — never a merge, and never overwriting an existing file.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

/** Namespaced so it reads as an authorization, not a grantable product feature. */
export const FIX_AGENT_AUTO_PR_KEY = 'fix_agent_auto_pr';

/** Fail-closed: any read error means "not authorized", never "assume yes". */
export async function isFixAgentAutoPrEnabled(
  supabase: SupabaseClient,
  userId: string
): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('user_feature_grants')
      .select('granted')
      .eq('user_id', userId)
      .eq('feature', FIX_AGENT_AUTO_PR_KEY)
      .maybeSingle();
    if (error) return false;
    return data?.granted === true;
  } catch {
    return false;
  }
}

/**
 * Set the user's own auto-PR authorization.
 *
 * `userId` is the caller's own id — the action layer takes it from the session, never from the
 * request body, so this cannot be used to toggle the setting for someone else.
 */
export async function setFixAgentAutoPr(
  supabase: SupabaseClient,
  userId: string,
  enabled: boolean
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const { error } = await supabase
      .from('user_feature_grants')
      .upsert(
        {
          user_id: userId,
          feature: FIX_AGENT_AUTO_PR_KEY,
          granted: enabled,
          granted_by: userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,feature' }
      );
    if (error) return { ok: false, reason: 'write_failed' };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'write_failed' };
  }
}
