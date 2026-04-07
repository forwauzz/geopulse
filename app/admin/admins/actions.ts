'use server';

import { revalidatePath } from 'next/cache';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';

export async function addPlatformAdmin(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) throw new Error(ctx.message);

  const email = (formData.get('email') as string | null)?.trim().toLowerCase();
  if (!email) throw new Error('Email is required.');

  // Look up user by email
  const { data: targetUser, error: lookupErr } = await ctx.adminDb
    .from('users')
    .select('id, email')
    .eq('email', email)
    .maybeSingle();

  if (lookupErr) throw new Error(`Lookup failed: ${lookupErr.message}`);
  if (!targetUser) throw new Error(`No user found with email: ${email}`);

  const notes = (formData.get('notes') as string | null)?.trim() || null;

  const { error: insertErr } = await ctx.adminDb
    .from('platform_admin_users')
    .insert({
      user_id: targetUser.id,
      granted_by: ctx.user.id,
      notes,
    });

  if (insertErr) {
    if (insertErr.code === '23505') {
      throw new Error('This user is already a platform admin.');
    }
    throw new Error(`Failed to add admin: ${insertErr.message}`);
  }

  revalidatePath('/admin/admins');
}

export async function removePlatformAdmin(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) throw new Error(ctx.message);

  const targetId = (formData.get('adminRowId') as string | null)?.trim();
  if (!targetId) throw new Error('Missing admin row ID.');

  // Prevent removing yourself
  const { data: targetRow } = await ctx.adminDb
    .from('platform_admin_users')
    .select('user_id')
    .eq('id', targetId)
    .maybeSingle();

  if (targetRow?.user_id === ctx.user.id) {
    throw new Error('You cannot remove yourself as a platform admin.');
  }

  // Prevent removing the last admin
  const { count } = await ctx.adminDb
    .from('platform_admin_users')
    .select('id', { count: 'exact', head: true });

  if ((count ?? 0) <= 1) {
    throw new Error('Cannot remove the last platform admin.');
  }

  const { error: deleteErr } = await ctx.adminDb
    .from('platform_admin_users')
    .delete()
    .eq('id', targetId);

  if (deleteErr) throw new Error(`Failed to remove admin: ${deleteErr.message}`);

  revalidatePath('/admin/admins');
}
