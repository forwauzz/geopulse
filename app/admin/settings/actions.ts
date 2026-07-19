'use server';

import { revalidatePath } from 'next/cache';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import { setUiFlag, UI_FLAG_KEYS, type UiFlagKey } from '@/lib/server/app-ui-flags';

const KEY_SET = new Set<string>(UI_FLAG_KEYS);

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
