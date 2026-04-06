import type { SupabaseClient } from '@supabase/supabase-js';
import { structuredLog, structuredError } from '@/lib/server/structured-log';

export type ProvisionWorkspaceArgs = {
  readonly userId: string;
  readonly userEmail: string;
  readonly bundleKey: string;
  readonly subscriptionId: string;
};

export type ProvisionWorkspaceResult = {
  readonly startupWorkspaceId: string | null;
  readonly agencyAccountId: string | null;
};

// ── Key derivation ───────────────────────────────────────────────────────────

/**
 * Derives a slug from an email domain.
 * "john@some-company.com" → "some-company"
 * "user@sub.domain.io" → "sub-domain"   (join host parts with -)
 * Only lowercase letters, numbers, hyphens (matches workspace_key CHECK constraint).
 */
function slugFromEmail(email: string): string {
  const domain = email.split('@').at(1) ?? 'workspace';
  // Take all parts except TLD (e.g., "sub.domain.io" → ["sub","domain"])
  const parts = domain.split('.');
  const meaningful = parts.length > 1 ? parts.slice(0, -1) : parts;
  const raw = meaningful.join('-').toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return raw.length > 0 ? raw.slice(0, 48) : 'workspace';
}

/**
 * Appends numeric suffix to avoid uniqueness collisions.
 * Returns the first available key up to suffix -99.
 */
async function deduplicateKey(
  supabase: SupabaseClient,
  table: 'startup_workspaces' | 'agency_accounts',
  column: 'workspace_key' | 'account_key',
  base: string
): Promise<string> {
  // Check base key first
  const { data: row } = await supabase
    .from(table)
    .select('id')
    .eq(column, base)
    .maybeSingle();

  if (!row) return base;

  // Try -2, -3, … -99
  for (let i = 2; i <= 99; i++) {
    const candidate = `${base}-${i}`;
    const { data: existing } = await supabase
      .from(table)
      .select('id')
      .eq(column, candidate)
      .maybeSingle();
    if (!existing) return candidate;
  }

  // Fallback: append timestamp millis (always unique)
  return `${base}-${Date.now()}`.slice(0, 63);
}

// ── Provision startup workspace ──────────────────────────────────────────────

async function provisionStartupWorkspace(
  supabase: SupabaseClient,
  args: ProvisionWorkspaceArgs
): Promise<string | null> {
  const baseSlug = slugFromEmail(args.userEmail);
  const workspaceKey = await deduplicateKey(
    supabase,
    'startup_workspaces',
    'workspace_key',
    baseSlug
  );

  // Derive display name from slug
  const name = workspaceKey
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const emailDomain = args.userEmail.split('@').at(1) ?? null;

  // Look up bundle ID for default_bundle_id FK
  const { data: bundle } = await supabase
    .from('service_bundles')
    .select('id')
    .eq('bundle_key', args.bundleKey)
    .maybeSingle();

  const { data: workspace, error: wsErr } = await supabase
    .from('startup_workspaces')
    .insert({
      workspace_key: workspaceKey,
      name,
      status: 'active',
      billing_mode: 'paid',
      primary_domain: emailDomain,
      default_bundle_id: bundle?.id ?? null,
      metadata: {
        source: 'self_serve',
        bundle_key: args.bundleKey,
        subscription_id: args.subscriptionId,
      },
    })
    .select('id')
    .single();

  if (wsErr || !workspace) {
    structuredError('provision_startup_workspace_failed', {
      userId: args.userId,
      bundleKey: args.bundleKey,
      error: wsErr?.message ?? 'no_row_returned',
    });
    return null;
  }

  // Add user as founder
  const { error: memberErr } = await supabase
    .from('startup_workspace_users')
    .insert({
      startup_workspace_id: workspace.id,
      user_id: args.userId,
      role: 'founder',
      status: 'active',
      metadata: { source: 'self_serve_subscription' },
    });

  if (memberErr) {
    structuredError('provision_startup_workspace_member_failed', {
      workspaceId: workspace.id,
      userId: args.userId,
      error: memberErr.message,
    });
    // Workspace created — still link the subscription even if member insert failed
  }

  // Link workspace ID back to the subscription row
  await supabase
    .from('user_subscriptions')
    .update({ startup_workspace_id: workspace.id })
    .eq('stripe_subscription_id', args.subscriptionId);

  structuredLog('provision_startup_workspace_created', {
    workspaceId: workspace.id,
    workspaceKey,
    userId: args.userId,
    bundleKey: args.bundleKey,
  }, 'info');

  return workspace.id;
}

// ── Provision agency account ─────────────────────────────────────────────────

async function provisionAgencyAccount(
  supabase: SupabaseClient,
  args: ProvisionWorkspaceArgs
): Promise<string | null> {
  const baseSlug = slugFromEmail(args.userEmail);
  const accountKey = await deduplicateKey(
    supabase,
    'agency_accounts',
    'account_key',
    baseSlug
  );

  const name = accountKey
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');

  const { data: account, error: accErr } = await supabase
    .from('agency_accounts')
    .insert({
      account_key: accountKey,
      name,
      status: 'active',
      billing_mode: 'public_checkout', // closest existing value for self-serve paid
      metadata: {
        source: 'self_serve',
        bundle_key: args.bundleKey,
        subscription_id: args.subscriptionId,
      },
    })
    .select('id')
    .single();

  if (accErr || !account) {
    structuredError('provision_agency_account_failed', {
      userId: args.userId,
      bundleKey: args.bundleKey,
      error: accErr?.message ?? 'no_row_returned',
    });
    return null;
  }

  // Add user as owner
  const { error: memberErr } = await supabase
    .from('agency_users')
    .insert({
      agency_account_id: account.id,
      user_id: args.userId,
      role: 'owner',
      status: 'active',
      metadata: { source: 'self_serve_subscription' },
    });

  if (memberErr) {
    structuredError('provision_agency_account_member_failed', {
      accountId: account.id,
      userId: args.userId,
      error: memberErr.message,
    });
  }

  // Link account ID back to the subscription row
  await supabase
    .from('user_subscriptions')
    .update({ agency_account_id: account.id })
    .eq('stripe_subscription_id', args.subscriptionId);

  structuredLog('provision_agency_account_created', {
    accountId: account.id,
    accountKey,
    userId: args.userId,
    bundleKey: args.bundleKey,
  }, 'info');

  return account.id;
}

// ── Main export ──────────────────────────────────────────────────────────────

/**
 * Auto-provisions a startup workspace or agency account for a new subscription.
 * Called by the Stripe webhook handler (`handleSubscriptionUpserted`) when
 * status is `active` or `trialing` and no workspace is linked yet.
 *
 * - startup_dev   → startup_workspaces + startup_workspace_users (role: founder)
 * - agency_core   → agency_accounts + agency_users (role: owner)
 * - agency_pro    → agency_accounts + agency_users (role: owner)
 *
 * Workspace key is derived from the user's email domain, deduplicated if needed.
 * Idempotent: caller checks `startup_workspace_id IS NULL AND agency_account_id IS NULL`
 * before calling.
 */
export async function provisionWorkspaceForSubscription(
  supabase: SupabaseClient,
  args: ProvisionWorkspaceArgs
): Promise<ProvisionWorkspaceResult> {
  switch (args.bundleKey) {
    case 'startup_dev': {
      const startupWorkspaceId = await provisionStartupWorkspace(supabase, args);
      return { startupWorkspaceId, agencyAccountId: null };
    }
    case 'agency_core':
    case 'agency_pro': {
      const agencyAccountId = await provisionAgencyAccount(supabase, args);
      return { startupWorkspaceId: null, agencyAccountId };
    }
    default: {
      structuredLog('provision_workspace_unknown_bundle', {
        bundleKey: args.bundleKey,
        userId: args.userId,
      }, 'warning');
      return { startupWorkspaceId: null, agencyAccountId: null };
    }
  }
}
