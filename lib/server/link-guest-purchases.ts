import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * After magic-link signup, attach guest checkout rows (same email) to `auth.users` id.
 * Service role only — bypasses RLS.
 */
export async function linkGuestPurchasesToUser(
  supabase: SupabaseClient,
  userId: string,
  email: string
): Promise<void> {
  const guestEmail = email.trim().toLowerCase();
  if (!guestEmail) {
    return;
  }

  const { data: payments, error: listErr } = await supabase
    .from('payments')
    .select('id, scan_id')
    .eq('guest_email', guestEmail)
    .is('user_id', null);

  if (listErr || !payments?.length) {
    return;
  }

  for (const p of payments) {
    const { error: payErr } = await supabase.from('payments').update({ user_id: userId }).eq('id', p.id);
    if (payErr) {
      return;
    }
    if (p.scan_id) {
      await supabase.from('scans').update({ user_id: userId }).eq('id', p.scan_id).is('user_id', null);
    }
  }

  await supabase
    .from('reports')
    .update({ user_id: userId, guest_email: null })
    .eq('guest_email', guestEmail)
    .is('user_id', null);
}
