'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { resolveAgencyFeatureEntitlements, validateAgencyContext } from '@/lib/server/agency-access';
import { provisionWorkspaceForSubscription } from '@/lib/server/billing/provision-workspace-for-subscription';
import { structuredLog } from '@/lib/server/structured-log';
import { subscriptionNeedsWorkspaceProvisioning } from '@/lib/server/subscription-provisioning-gap';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect('/');
}

/** Self-serve: same provisioning path as admin + Stripe webhook; verifies subscription belongs to session user. */
export async function provisionMyWorkspaceForSubscription(formData: FormData): Promise<void> {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) throw new Error('Sign in again.');

  const subRowId = (formData.get('subRowId') as string | null)?.trim();
  if (!subRowId) throw new Error('Missing subscription.');

  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) throw new Error('Billing is not configured.');

  const adminDb = createServiceRoleClient(url, key);

  const { data: subRow, error: fetchErr } = await adminDb
    .from('user_subscriptions')
    .select(
      'id, user_id, bundle_key, stripe_subscription_id, startup_workspace_id, agency_account_id, status',
    )
    .eq('id', subRowId)
    .maybeSingle();

  if (fetchErr || !subRow) throw new Error('Subscription not found.');
  if (subRow.user_id !== user.id) throw new Error('Forbidden.');

  if (!subscriptionNeedsWorkspaceProvisioning(subRow)) {
    throw new Error('Workspace already exists or subscription is not eligible.');
  }

  const { data: userRow } = await adminDb.from('users').select('email').eq('id', user.id).maybeSingle();
  if (!userRow?.email) throw new Error('User email not found.');

  const result = await provisionWorkspaceForSubscription(adminDb, {
    userId: subRow.user_id,
    userEmail: userRow.email,
    bundleKey: subRow.bundle_key,
    subscriptionId: subRow.stripe_subscription_id,
  });

  if (!result.startupWorkspaceId && !result.agencyAccountId) {
    throw new Error('Could not create workspace. Try again or contact support.');
  }

  structuredLog(
    'user_self_provision_workspace',
    { userId: user.id, subRowId, bundleKey: subRow.bundle_key },
    'info',
  );

  revalidatePath('/dashboard');

  if (result.startupWorkspaceId) {
    redirect(`/dashboard?startupWorkspace=${result.startupWorkspaceId}`);
  }
  if (result.agencyAccountId) {
    redirect(`/dashboard?agencyAccount=${result.agencyAccountId}`);
  }
  throw new Error('Could not create workspace. Try again or contact support.');
}

const agencyClientSchema = z.object({
  agencyAccountId: z.string().uuid('Choose a valid agency account.'),
  clientKey: z
    .string()
    .min(2, 'Enter a client key.')
    .max(80, 'Client key is too long.')
    .regex(/^[a-z0-9-]+$/, 'Use lowercase letters, numbers, and hyphens only.'),
  name: z.string().min(1, 'Enter a client name.').max(120, 'Client name is too long.'),
  primaryDomain: z.string().min(1, 'Enter a primary domain.').max(160, 'Primary domain is too long.'),
  vertical: z.string().max(80, 'Vertical is too long.').optional(),
  subvertical: z.string().max(80, 'Subvertical is too long.').optional(),
  icpTag: z.string().max(80, 'ICP tag is too long.').optional(),
});

const agencyClientDomainSchema = z.object({
  agencyAccountId: z.string().uuid('Choose a valid agency account.'),
  agencyClientId: z.string().uuid('Choose a valid client.'),
  domainInput: z.string().min(1, 'Enter a domain or site URL.').max(200, 'Domain input is too long.'),
  isPrimary: z.boolean(),
});

export type AgencyDashboardActionState =
  | { ok: true; message: string }
  | { ok: false; message: string };

function normalizeText(raw: FormDataEntryValue | null): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const value = raw.trim();
  return value.length > 0 ? value : undefined;
}

function normalizeDomainHost(value: string): string {
  const trimmed = value.trim();
  const withScheme = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const hostname = new URL(withScheme).hostname.trim().toLowerCase();
  return hostname.replace(/\.$/, '');
}

function normalizeSiteUrl(value: string): string {
  const trimmed = value.trim();
  const withScheme = /^[a-z]+:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withScheme);
  url.hash = '';
  url.search = '';
  url.pathname = '/';
  return url.toString();
}

async function loadAgencyMemberActionContext(agencyAccountId: string): Promise<
  | {
      ok: true;
      adminDb: ReturnType<typeof createServiceRoleClient>;
      userId: string;
    }
  | { ok: false; message: string }
> {
  const sessionClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await sessionClient.auth.getUser();

  if (!user?.id) {
    return { ok: false, message: 'Sign in again before managing agency clients.' };
  }

  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) {
    return { ok: false, message: 'Agency management is not configured.' };
  }

  const adminDb = createServiceRoleClient(url, key);
  const isMember = await validateAgencyContext({
    supabase: adminDb,
    userId: user.id,
    agencyAccountId,
    agencyClientId: null,
  });

  if (!isMember) {
    return { ok: false, message: 'You do not have access to manage this agency account.' };
  }

  const { data: membership, error: membershipError } = await adminDb
    .from('agency_users')
    .select('role,status')
    .eq('agency_account_id', agencyAccountId)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle();

  if (membershipError) {
    return { ok: false, message: membershipError.message };
  }

  if (!membership || membership.role === 'viewer') {
    return { ok: false, message: 'Your agency role cannot manage clients or domains.' };
  }

  const entitlements = await resolveAgencyFeatureEntitlements({
    supabase: adminDb,
    agencyAccountId,
    agencyClientId: null,
  });

  if (!entitlements.agencyDashboardEnabled) {
    return { ok: false, message: 'Agency dashboard is disabled for this account.' };
  }

  return { ok: true, adminDb, userId: user.id };
}

export async function createAgencyClientFromDashboard(
  _prev: AgencyDashboardActionState | null,
  formData: FormData
): Promise<AgencyDashboardActionState> {
  const parsed = agencyClientSchema.safeParse({
    agencyAccountId: normalizeText(formData.get('agencyAccountId')),
    clientKey: normalizeText(formData.get('clientKey')),
    name: normalizeText(formData.get('name')),
    primaryDomain: normalizeText(formData.get('primaryDomain')),
    vertical: normalizeText(formData.get('vertical')),
    subvertical: normalizeText(formData.get('subvertical')),
    icpTag: normalizeText(formData.get('icpTag')),
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message:
        errors['agencyAccountId']?.[0] ??
        errors['clientKey']?.[0] ??
        errors['name']?.[0] ??
        errors['primaryDomain']?.[0] ??
        errors['vertical']?.[0] ??
        errors['subvertical']?.[0] ??
        errors['icpTag']?.[0] ??
        'Check the client values.',
    };
  }

  const context = await loadAgencyMemberActionContext(parsed.data.agencyAccountId);
  if (!context.ok) return context;

  const primaryDomain = normalizeDomainHost(parsed.data.primaryDomain);
  const siteUrl = normalizeSiteUrl(parsed.data.primaryDomain);

  const { data: client, error: clientError } = await context.adminDb
    .from('agency_clients')
    .insert({
      agency_account_id: parsed.data.agencyAccountId,
      client_key: parsed.data.clientKey,
      name: parsed.data.name,
      display_name: parsed.data.name,
      website_domain: primaryDomain,
      canonical_domain: primaryDomain,
      status: 'active',
      vertical: parsed.data.vertical ?? null,
      subvertical: parsed.data.subvertical ?? null,
      icp_tag: parsed.data.icpTag ?? null,
      metadata: { source: 'agency_dashboard' },
    })
    .select('id')
    .single();

  if (clientError || !client?.id) {
    return { ok: false, message: clientError?.message ?? 'Could not create agency client.' };
  }

  const { error: domainError } = await context.adminDb.from('agency_client_domains').insert({
    agency_client_id: client.id,
    domain: primaryDomain,
    canonical_domain: primaryDomain,
    site_url: siteUrl,
    is_primary: true,
    metadata: { source: 'agency_dashboard' },
  });

  if (domainError) {
    return { ok: false, message: domainError.message };
  }

  revalidatePath('/dashboard');
  return { ok: true, message: 'Client created.' };
}

export async function addAgencyClientDomainFromDashboard(
  _prev: AgencyDashboardActionState | null,
  formData: FormData
): Promise<AgencyDashboardActionState> {
  const parsed = agencyClientDomainSchema.safeParse({
    agencyAccountId: normalizeText(formData.get('agencyAccountId')),
    agencyClientId: normalizeText(formData.get('agencyClientId')),
    domainInput: normalizeText(formData.get('domainInput')),
    isPrimary: String(formData.get('isPrimary') ?? '') === 'true',
  });

  if (!parsed.success) {
    const errors = parsed.error.flatten().fieldErrors;
    return {
      ok: false,
      message:
        errors['agencyAccountId']?.[0] ??
        errors['agencyClientId']?.[0] ??
        errors['domainInput']?.[0] ??
        'Check the domain values.',
    };
  }

  const context = await loadAgencyMemberActionContext(parsed.data.agencyAccountId);
  if (!context.ok) return context;

  const { data: client, error: clientError } = await context.adminDb
    .from('agency_clients')
    .select('id')
    .eq('id', parsed.data.agencyClientId)
    .eq('agency_account_id', parsed.data.agencyAccountId)
    .eq('status', 'active')
    .maybeSingle();

  if (clientError) {
    return { ok: false, message: clientError.message };
  }
  if (!client?.id) {
    return { ok: false, message: 'Selected client was not found for this account.' };
  }

  const domain = normalizeDomainHost(parsed.data.domainInput);
  const siteUrl = normalizeSiteUrl(parsed.data.domainInput);

  if (parsed.data.isPrimary) {
    const { error: clearPrimaryError } = await context.adminDb
      .from('agency_client_domains')
      .update({ is_primary: false })
      .eq('agency_client_id', parsed.data.agencyClientId)
      .eq('is_primary', true);

    if (clearPrimaryError) {
      return { ok: false, message: clearPrimaryError.message };
    }
  }

  const { error } = await context.adminDb.from('agency_client_domains').insert({
    agency_client_id: parsed.data.agencyClientId,
    domain,
    canonical_domain: domain,
    site_url: siteUrl,
    is_primary: parsed.data.isPrimary,
    metadata: { source: 'agency_dashboard' },
  });

  if (error) {
    return { ok: false, message: error.message };
  }

  revalidatePath('/dashboard');
  return { ok: true, message: 'Client domain added.' };
}
