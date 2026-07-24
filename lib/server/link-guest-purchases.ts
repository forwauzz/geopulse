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

  if (listErr) {
    return;
  }

  for (const p of payments ?? []) {
    const { error: payErr } = await supabase.from('payments').update({ user_id: userId }).eq('id', p.id);
    if (payErr) {
      return;
    }
    if (p.scan_id) {
      await supabase.from('scans').update({ user_id: userId }).eq('id', p.scan_id).is('user_id', null);
    }
  }

  if (payments?.length) {
    await supabase
      .from('reports')
      .update({ user_id: userId, guest_email: null })
      .eq('guest_email', guestEmail)
      .is('user_id', null);
  }

  // Monitoring was originally email-keyed. Link any existing subscription to the account's
  // Stripe customer and claim its baseline scan when that customer later creates/signs in.
  const { data: monitors } = await supabase
    .from('monitoring_subscriptions')
    .select('stripe_customer_id,origin_scan_id')
    .eq('email', guestEmail)
    .order('created_at', { ascending: false });
  const newestCustomerId = monitors?.find((row) => row.stripe_customer_id)?.stripe_customer_id ?? null;
  if (newestCustomerId) {
    await supabase
      .from('users')
      .update({ stripe_customer_id: newestCustomerId })
      .eq('id', userId)
      .is('stripe_customer_id', null);
  }
  for (const monitor of monitors ?? []) {
    if (monitor.origin_scan_id) {
      await supabase
        .from('scans')
        .update({ user_id: userId })
        .eq('id', monitor.origin_scan_id)
        .is('user_id', null);
    }
  }
}
