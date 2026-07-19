'use server';

import { revalidatePath } from 'next/cache';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import { setUiFlag, UI_FLAG_KEYS, type UiFlagKey } from '@/lib/server/app-ui-flags';
import {
  findUserIdByEmail,
  setUserFeatureGrant,
  USER_FEATURE_KEYS,
  type UserFeatureKey,
} from '@/lib/server/user-feature-grants';

const KEY_SET = new Set<string>(UI_FLAG_KEYS);
const FEATURE_SET = new Set<string>(USER_FEATURE_KEYS);

/** Toggle one global UI visibility flag (platform-admin only). */
export async function setAppUiFlag(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;
  const key = String(formData.get('key') ?? '');
  const enabled = String(formData.get('value') ?? '') === 'true';
  if (!KEY_SET.has(key)) return;
  await setUiFlag(key as UiFlagKey, enabled, ctx.user.id);
  revalidatePath('/admin/settings');
}

/** Grant or revoke a feature for a user, resolved by email. Returns a status via redirect param. */
export async function grantUserFeature(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;
  const email = String(formData.get('email') ?? '');
  const feature = String(formData.get('feature') ?? '');
  const granted = String(formData.get('granted') ?? 'true') === 'true';
  if (!FEATURE_SET.has(feature)) return;
  const userId = await findUserIdByEmail(ctx.adminDb, email);
  if (!userId) {
    revalidatePath('/admin/settings');
    return;
  }
  await setUserFeatureGrant(ctx.adminDb, userId, feature as UserFeatureKey, granted, ctx.user.id);
  revalidatePath('/admin/settings');
}

/** Rename a startup workspace (fixes auto-derived names like "Gmail"). */
export async function renameWorkspace(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) return;
  const workspaceId = String(formData.get('workspaceId') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  if (!workspaceId || name.length < 2 || name.length > 80) return;
  await ctx.adminDb.from('startup_workspaces').update({ name }).eq('id', workspaceId);
  revalidatePath('/admin/settings');
}
