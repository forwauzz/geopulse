'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { loadAdminActionContext } from '@/lib/server/admin-runtime';
import { structuredLog } from '@/lib/server/structured-log';

// ── Update bundle-level billing config ───────────────────────────────────────
export async function updateBundleBilling(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) throw new Error(ctx.message);

  const bundleKey = (formData.get('bundleKey') as string | null)?.trim();
  if (!bundleKey) throw new Error('bundleKey is required.');

  const billingMode = (formData.get('billingMode') as string | null)?.trim();
  const stripePriceId = (formData.get('stripePriceId') as string | null)?.trim() || null;
  const monthlyCentsRaw = formData.get('monthlyCents') as string | null;
  const trialDaysRaw = formData.get('trialDays') as string | null;

  const monthlyCents = monthlyCentsRaw ? parseInt(monthlyCentsRaw, 10) : null;
  const trialDays = trialDaysRaw ? parseInt(trialDaysRaw, 10) : 0;

  const validModes = ['free', 'monthly', 'annual'];
  if (billingMode && !validModes.includes(billingMode)) {
    throw new Error(`Invalid billing mode: ${billingMode}`);
  }

  const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (billingMode) updatePayload['billing_mode'] = billingMode;
  if (stripePriceId !== undefined) updatePayload['stripe_price_id'] = stripePriceId;
  if (monthlyCents !== null && !Number.isNaN(monthlyCents)) {
    updatePayload['monthly_price_cents'] = monthlyCents;
  }
  if (!Number.isNaN(trialDays)) updatePayload['trial_period_days'] = trialDays;

  const { error } = await ctx.adminDb
    .from('service_bundles')
    .update(updatePayload)
    .eq('bundle_key', bundleKey);

  if (error) throw new Error(`Failed to update bundle: ${error.message}`);

  structuredLog('admin_update_bundle_billing', {
    adminId: ctx.user.id,
    bundleKey,
    ...updatePayload,
  }, 'info');

  revalidatePath(`/admin/bundles/${bundleKey}`);
  revalidatePath('/admin/services');
}

// ── Bulk-upsert service assignments for a bundle ─────────────────────────────
// Receives repeated fields: serviceId[], included[], usageLimit[]
// The arrays are positional — index N in each array corresponds to the same service.
export async function upsertBundleServices(formData: FormData): Promise<void> {
  const ctx = await loadAdminActionContext();
  if (!ctx.ok) throw new Error(ctx.message);

  const bundleKey = (formData.get('bundleKey') as string | null)?.trim();
  if (!bundleKey) throw new Error('bundleKey is required.');

  const { data: bundle } = await ctx.adminDb
    .from('service_bundles')
    .select('id')
    .eq('bundle_key', bundleKey)
    .maybeSingle();

  if (!bundle) throw new Error(`Bundle not found: ${bundleKey}`);

  const serviceIds = formData.getAll('serviceId') as string[];
  const includedFlags = formData.getAll('included') as string[];
  const usageLimits = formData.getAll('usageLimit') as string[];

  if (serviceIds.length === 0) throw new Error('No services provided.');

  const rows = serviceIds.map((serviceId, i) => {
    const included = includedFlags[i] === 'true';
    return {
      bundle_id: bundle.id,
      service_id: serviceId,
      enabled: included,
      access_mode: included ? 'free' : 'off',
      usage_limit: included && usageLimits[i] ? parseInt(usageLimits[i]!, 10) || null : null,
      metadata: {},
      updated_at: new Date().toISOString(),
    };
  });
  const includedCount = rows.filter((row) => row.enabled).length;
  const excludedCount = rows.length - includedCount;

  const { error } = await ctx.adminDb
    .from('service_bundle_services')
    .upsert(rows, {
      onConflict: 'bundle_id,service_id',
      ignoreDuplicates: false,
    });

  if (error) throw new Error(`Failed to update services: ${error.message}`);

  structuredLog(
    'admin_upsert_bundle_services',
    {
      adminId: ctx.user.id,
      bundleKey,
      serviceCount: rows.length,
    },
    'info'
  );

  revalidatePath(`/admin/bundles/${bundleKey}`);
  redirect(`/admin/bundles/${bundleKey}?saved=services&included=${includedCount}&excluded=${excludedCount}`);
}
