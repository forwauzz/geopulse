import type { SupabaseClient } from '@supabase/supabase-js';
import { structuredLog, structuredError } from '@/lib/server/structured-log';

export type ProvisionWorkspaceArgs = {
  readonly userId: string;
  readonly userEmail: string;
  readonly bundleKey: string;
  readonly subscriptionId: string;
  readonly organizationName?: string | null;
};

export type ProvisionWorkspaceResult = {
  readonly startupWorkspaceId: string | null;
  readonly agencyAccountId: string | null;
};

// ── Key derivation ───────────────────────────────────────────────────────────

/**
 * Derives a readable slug from an email domain for display names only.
 * "john@some-company.com" → "some-company"
 * "user@sub.domain.io" → "sub-domain"   (join host parts with -)
 */
function slugFromEmail(email: string): string {
  const domain = email.split('@').at(1) ?? 'workspace';
  const parts = domain.split('.');
  const meaningful = parts.length > 1 ? parts.slice(0, -1) : parts;
  const raw = meaningful
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return raw.length > 0 ? raw.slice(0, 48) : 'workspace';
}

function displayNameFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function normalizeOrganizationName(value?: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed.slice(0, 120) : null;
}

/**
 * Builds a stable child-record key from the Stripe subscription id.
 * This keeps workspace/account provisioning idempotent under webhook retries.
 */
export function subscriptionProvisioningKey(
  scope: 'startup' | 'agency',
  subscriptionId: string
): string {
  const raw = `${scope}-${subscriptionId}`.toLowerCase();
  const normalized = raw.replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  return normalized.slice(0, 63);
}

// ── Provision startup workspace ──────────────────────────────────────────────

async function provisionStartupWorkspace(
  supabase: SupabaseClient,
  args: ProvisionWorkspaceArgs
): Promise<string | null> {
  const workspaceKey = subscriptionProvisioningKey('startup', args.subscriptionId);
  const organizationName = normalizeOrganizationName(args.organizationName);
  const name = organizationName ?? displayNameFromSlug(slugFromEmail(args.userEmail));

  const emailDomain = args.userEmail.split('@').at(1) ?? null;

  // Look up bundle ID for default_bundle_id FK
  const { data: bundle } = await supabase
    .from('service_bundles')
    .select('id')
    .eq('bundle_key', args.bundleKey)
    .maybeSingle();

  const { data: workspace, error: wsErr } = await supabase
    .from('startup_workspaces')
    .upsert(
      {
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
          ...(organizationName ? { organization_name: organizationName } : {}),
        },
      },
      { onConflict: 'workspace_key' }
    )
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
    .upsert(
      {
        startup_workspace_id: workspace.id,
        user_id: args.userId,
        role: 'founder',
        status: 'active',
        metadata: { source: 'self_serve_subscription' },
      },
      { onConflict: 'startup_workspace_id,user_id' }
    );

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
  const accountKey = subscriptionProvisioningKey('agency', args.subscriptionId);
  const organizationName = normalizeOrganizationName(args.organizationName);
  const name = organizationName ?? displayNameFromSlug(slugFromEmail(args.userEmail));

  const { data: account, error: accErr } = await supabase
    .from('agency_accounts')
    .upsert(
      {
        account_key: accountKey,
        name,
        status: 'active',
        billing_mode: 'public_checkout', // closest existing value for self-serve paid
        metadata: {
          source: 'self_serve',
          bundle_key: args.bundleKey,
          subscription_id: args.subscriptionId,
          ...(organizationName ? { organization_name: organizationName } : {}),
        },
      },
      { onConflict: 'account_key' }
    )
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
    .upsert(
      {
        agency_account_id: account.id,
        user_id: args.userId,
        role: 'owner',
        status: 'active',
        metadata: { source: 'self_serve_subscription' },
      },
      { onConflict: 'agency_account_id,user_id' }
    );

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
 * Workspace/account key is derived from the subscription id, deduplicated by scope.
 * Display name prefers user-entered organizationName and falls back to an email slug.
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
