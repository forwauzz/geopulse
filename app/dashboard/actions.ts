'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { redirect } from 'next/navigation';
import { resolveAgencyFeatureEntitlements, validateAgencyContext } from '@/lib/server/agency-access';
import { provisionWorkspaceForSubscription } from '@/lib/server/billing/provision-workspace-for-subscription';
import { provisionCustomerVisibilityBaseline } from '@/lib/server/customer-visibility-baseline';
import { structuredLog } from '@/lib/server/structured-log';
import { subscriptionNeedsWorkspaceProvisioning } from '@/lib/server/subscription-provisioning-gap';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { completeAgencyClientBaseline } from '@/lib/server/agency-client-baseline';
import { getAutonomousEditorialEnv, getPaymentApiEnv } from '@/lib/server/cf-env';
import {
  confirmOrganizationOnboarding,
  type ValueFirstOnboardingActionState,
} from '@/lib/intelligence/value-first-onboarding';
import { persistConfirmedOrganizationContext } from '@/lib/server/organization-context-repository';
import { resolveValueFirstOnboardingProposal } from '@/lib/server/value-first-onboarding';
import { recordActivationEvent } from '@/lib/server/activation-events';

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
      'id, user_id, bundle_key, stripe_subscription_id, startup_workspace_id, agency_account_id, status, metadata',
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

  const organizationName =
    typeof subRow.metadata === 'object' &&
    subRow.metadata !== null &&
    typeof (subRow.metadata as Record<string, unknown>)['organization_name'] === 'string'
      ? ((subRow.metadata as Record<string, unknown>)['organization_name'] as string)
      : null;

  const result = await provisionWorkspaceForSubscription(adminDb, {
    userId: subRow.user_id,
    userEmail: userRow.email,
    bundleKey: subRow.bundle_key,
    subscriptionId: subRow.stripe_subscription_id,
    organizationName,
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
  intent: z.literal('agency'),
  name: z.string().min(1, 'Enter a client name.').max(120, 'Client name is too long.'),
  website: z.string().min(1, 'Enter a primary domain.').max(200, 'Website is too long.'),
  confirmed: z.literal('1').optional(),
  displayName: z.string().trim().max(120).optional(),
  category: z.string().trim().max(120).optional(),
  countryCode: z.string().trim().max(80).optional(),
  subdivisionCode: z.string().trim().max(8).optional(),
  locality: z.string().trim().max(120).optional(),
  marketScope: z.enum(['local', 'regional', 'national', 'online', 'global']).optional(),
  languages: z.string().trim().max(160).optional(),
  timezone: z.string().trim().max(80).optional(),
});

/** Same confirmation fields as onboarding, addressed to a client that already exists. */
const agencyClientMarketSchema = agencyClientSchema
  .omit({ website: true })
  .extend({ agencyClientId: z.string().uuid('Choose a valid client.') });

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

function clientKeyFromName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return `${slug || 'client'}-${crypto.randomUUID().slice(0, 6)}`;
}

async function loadAgencyMemberActionContext(agencyAccountId: string): Promise<
  | {
      ok: true;
      adminDb: ReturnType<typeof createServiceRoleClient>;
      userId: string;
      userEmail: string | null;
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

  return { ok: true, adminDb, userId: user.id, userEmail: user.email ?? null };
}

export async function createAgencyClientFromDashboard(
  _prev: ValueFirstOnboardingActionState | null,
  formData: FormData
): Promise<ValueFirstOnboardingActionState> {
  const parsed = agencyClientSchema.safeParse({
    agencyAccountId: normalizeText(formData.get('agencyAccountId')),
    intent: normalizeText(formData.get('intent')),
    name: normalizeText(formData.get('name')),
    website: normalizeText(formData.get('website')),
    confirmed: normalizeText(formData.get('confirmed')),
    displayName: normalizeText(formData.get('displayName')),
    category: normalizeText(formData.get('category')),
    countryCode: normalizeText(formData.get('countryCode')),
    subdivisionCode: normalizeText(formData.get('subdivisionCode')),
    locality: normalizeText(formData.get('locality')),
    marketScope: normalizeText(formData.get('marketScope')),
    languages: normalizeText(formData.get('languages')),
    timezone: normalizeText(formData.get('timezone')),
  });

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Enter the client name and public website to continue.',
    };
  }

  const context = await loadAgencyMemberActionContext(parsed.data.agencyAccountId);
  if (!context.ok) return { status: 'error', message: context.message };
  const detected = await resolveValueFirstOnboardingProposal({
    intent: 'agency',
    name: parsed.data.name,
    website: parsed.data.website,
  });
  if (!detected.ok) {
    return {
      status: 'error',
      message: detected.message,
      draft: { intent: 'agency', name: parsed.data.name, website: parsed.data.website },
    };
  }
  if (parsed.data.confirmed !== '1') {
    return {
      status: 'needs_confirmation',
      proposal: detected.proposal,
      message: 'Confirm the detected client and market.',
    };
  }
  const confirmation = confirmOrganizationOnboarding(detected.proposal, parsed.data);
  if (!confirmation.ok) {
    return {
      status: 'needs_confirmation',
      proposal: { ...detected.proposal, missingFields: confirmation.missingFields },
      message: 'Answer the remaining question before the client baseline is built.',
    };
  }
  const confirmed = confirmation.value;
  const primaryDomain = normalizeDomainHost(confirmed.canonicalDomain);
  const siteUrl = normalizeSiteUrl(confirmed.submittedWebsite);
  const now = new Date().toISOString();
  const { data: existingClient, error: existingClientError } = await context.adminDb
    .from('agency_clients')
    .select('id,metadata,vertical,subvertical')
    .eq('agency_account_id', parsed.data.agencyAccountId)
    .eq('canonical_domain', primaryDomain)
    .maybeSingle();
  if (existingClientError) return { status: 'error', message: existingClientError.message };
  const existingMetadata = existingClient?.metadata && typeof existingClient.metadata === 'object'
    ? existingClient.metadata as Record<string, unknown>
    : {};
  const clientPayload = {
    agency_account_id: parsed.data.agencyAccountId,
    name: confirmed.displayName,
    display_name: confirmed.displayName,
    website_domain: primaryDomain,
    canonical_domain: primaryDomain,
    status: 'active',
    vertical: existingClient?.vertical ?? confirmed.category,
    subvertical: existingClient?.subvertical ?? null,
    metadata: {
      ...existingMetadata,
      source: 'value_first_onboarding',
      location: confirmed.locality ?? confirmed.serviceAreas[0] ?? confirmed.countryCode,
      report_quarantine_hold: existingMetadata['report_quarantine_hold'] ?? {
        status: 'held_onboarding_review',
        reason: 'First client artifact stays private until the agency explicitly releases it.',
        held_at: now,
        held_by_user_id: context.userId,
      },
    },
  };
  const { data: client, error: clientError } = existingClient?.id
    ? await context.adminDb
        .from('agency_clients')
        .update(clientPayload)
        .eq('id', existingClient.id)
        .select('id')
        .single()
    : await context.adminDb
        .from('agency_clients')
        .insert({ ...clientPayload, client_key: clientKeyFromName(confirmed.displayName) })
        .select('id')
        .single();
  if (clientError || !client?.id) {
    return { status: 'error', message: clientError?.message ?? 'Could not create the client safely.' };
  }

  const { data: existingDomain, error: existingDomainError } = await context.adminDb
    .from('agency_client_domains')
    .select('id')
    .eq('agency_client_id', client.id)
    .eq('canonical_domain', primaryDomain)
    .maybeSingle();
  if (existingDomainError) return { status: 'error', message: existingDomainError.message };
  if (!existingDomain?.id) {
    const { error: domainError } = await context.adminDb.from('agency_client_domains').insert({
      agency_client_id: client.id,
      domain: primaryDomain,
      canonical_domain: primaryDomain,
      site_url: siteUrl,
      is_primary: true,
      metadata: { source: 'value_first_onboarding' },
    });
    if (domainError) return { status: 'error', message: domainError.message };
  }

  let organizationContext: Awaited<ReturnType<typeof persistConfirmedOrganizationContext>>;
  try {
    organizationContext = await persistConfirmedOrganizationContext({
      supabase: context.adminDb,
      input: {
        ownerType: 'agency_client',
        ownerId: String(client.id),
        actorId: context.userId,
        canonicalDomain: primaryDomain,
        displayName: confirmed.displayName,
        category: confirmed.category,
        services: confirmed.services,
        buyer: confirmed.buyer,
        marketScope: confirmed.marketScope,
        countryCode: confirmed.countryCode,
        subdivisionCode: confirmed.subdivisionCode,
        locality: confirmed.locality,
        serviceAreas: confirmed.serviceAreas,
        languages: confirmed.languages,
        timezone: confirmed.timezone,
        approvedCompetitorDomains: [],
        source: 'agency_client_value_first_onboarding',
      },
    });
  } catch {
    return {
      status: 'error',
      message: 'The client is saved, but its market confirmation could not be applied yet. Try again to resume safely.',
      draft: { intent: 'agency', name: confirmed.displayName, website: confirmed.submittedWebsite },
    };
  }

  const baseline = await provisionCustomerVisibilityBaseline(context.adminDb, {
    agencyAccountId: parsed.data.agencyAccountId,
    domain: primaryDomain,
    companyName: confirmed.displayName,
    vertical: confirmed.category,
    subvertical: existingClient?.subvertical ?? null,
    location: confirmed.locality ?? confirmed.serviceAreas[0] ?? confirmed.countryCode,
    organizationContext,
    source: 'agency_client_creation',
  });
  let completedBaseline: Awaited<ReturnType<typeof completeAgencyClientBaseline>> | null = null;
  if (baseline.ok) {
    try {
      const [env, editorialEnv] = await Promise.all([
        getPaymentApiEnv(),
        getAutonomousEditorialEnv(),
      ]);
      completedBaseline = await completeAgencyClientBaseline({
        supabase: context.adminDb,
        env,
        agencyAccountId: parsed.data.agencyAccountId,
        clientId: client.id,
        userId: context.userId,
        reportEmail: context.userEmail,
        reportBucket: editorialEnv.REPORT_FILES
          ? {
              put: (key, value, options) =>
                editorialEnv.REPORT_FILES!.put(
                  key,
                  value instanceof Uint8Array ? new Uint8Array(value).slice().buffer : value,
                  options ? { httpMetadata: { contentType: options.httpMetadata?.contentType } } : undefined,
                ),
            }
          : undefined,
      });
    } catch {
      // The client is safely created and queued; the same idempotent loop can retry from its page.
      completedBaseline = null;
    }
  }
  await recordActivationEvent({
    supabase: context.adminDb,
    eventName: 'agency_client_activation_started',
    userId: context.userId,
    ownerId: String(client.id),
    canonicalDomain: primaryDomain,
    contextVersion: organizationContext.contextVersion,
  });

  revalidatePath('/dashboard');
  revalidatePath('/dashboard/clients');
  revalidatePath('/dashboard/visibility');
  const query = new URLSearchParams({
    agencyAccount: parsed.data.agencyAccountId,
    activation: '1',
    baseline: completedBaseline?.ok ? 'complete' : completedBaseline?.reason ?? (baseline.ok ? 'queued' : baseline.reason),
  });
  redirect(`/dashboard/clients/${client.id}?${query.toString()}`);
}

/**
 * The competitor cohort already stored for a client's domain, if any.
 *
 * Read rather than asked for again: an agency that has curated competitors should
 * not have to retype them to confirm a market, and a confirmation must never be
 * the step that empties them.
 */
async function loadClientCompetitorCohort(
  adminDb: ReturnType<typeof createServiceRoleClient>,
  agencyAccountId: string,
  canonicalDomain: string
): Promise<readonly string[]> {
  const { data: domain } = await adminDb
    .from('benchmark_domains')
    .select('id')
    .eq('canonical_domain', canonicalDomain)
    .maybeSingle();
  if (!domain?.id) return [];
  const { data: config } = await adminDb
    .from('client_benchmark_configs')
    .select('competitor_list')
    .eq('agency_account_id', agencyAccountId)
    .eq('benchmark_domain_id', domain.id)
    .maybeSingle();
  return Array.isArray(config?.competitor_list)
    ? config.competitor_list.filter((entry: unknown): entry is string => typeof entry === 'string')
    : [];
}

/**
 * Confirm market context for a client that already exists.
 *
 * `createAgencyClientFromDashboard` writes the confirmed context as part of
 * creating a client, so every client created before that flow landed has none —
 * and `completeAgencyClientBaseline` refuses to measure without one. There was
 * no second way in, which left those clients permanently unable to run a
 * baseline. This is the same confirmation, addressed to an existing client.
 *
 * The domain is taken from the stored client record rather than the form: the
 * baseline looks context up by the client's canonical domain, so confirming
 * against any other host would write a context that is never read.
 */
export async function confirmAgencyClientMarket(
  _prev: ValueFirstOnboardingActionState | null,
  formData: FormData
): Promise<ValueFirstOnboardingActionState> {
  const parsed = agencyClientMarketSchema.safeParse({
    agencyAccountId: normalizeText(formData.get('agencyAccountId')),
    agencyClientId: normalizeText(formData.get('agencyClientId')),
    intent: normalizeText(formData.get('intent')),
    name: normalizeText(formData.get('name')),
    confirmed: normalizeText(formData.get('confirmed')),
    displayName: normalizeText(formData.get('displayName')),
    category: normalizeText(formData.get('category')),
    countryCode: normalizeText(formData.get('countryCode')),
    subdivisionCode: normalizeText(formData.get('subdivisionCode')),
    locality: normalizeText(formData.get('locality')),
    marketScope: normalizeText(formData.get('marketScope')),
    languages: normalizeText(formData.get('languages')),
    timezone: normalizeText(formData.get('timezone')),
  });
  if (!parsed.success) {
    return { status: 'error', message: 'Confirm the client name and market to continue.' };
  }

  const context = await loadAgencyMemberActionContext(parsed.data.agencyAccountId);
  if (!context.ok) return { status: 'error', message: context.message };

  // Scoped to the agency account, so a member cannot confirm another tenant's client.
  const { data: client, error: clientError } = await context.adminDb
    .from('agency_clients')
    .select('id,name,display_name,canonical_domain,website_domain')
    .eq('id', parsed.data.agencyClientId)
    .eq('agency_account_id', parsed.data.agencyAccountId)
    .eq('status', 'active')
    .maybeSingle();
  if (clientError) return { status: 'error', message: clientError.message };
  if (!client?.id) return { status: 'error', message: 'That client is not available on this agency account.' };

  // Guarded before normalising: normalizeDomainHost builds a URL and throws on
  // an empty host, which would surface as a crash rather than this message.
  const rawDomain = String(client.canonical_domain || client.website_domain || '').trim();
  if (!rawDomain) {
    return { status: 'error', message: 'Add a primary domain for this client before confirming its market.' };
  }
  const storedDomain = normalizeDomainHost(rawDomain);

  // An absolute URL, not the bare host: the resolver's SSRF validator parses
  // with `new URL(...)`, which throws on a scheme-less value and surfaces as
  // "we could not read that website" long before any request is made.
  const detected = await resolveValueFirstOnboardingProposal({
    intent: 'agency',
    name: parsed.data.name,
    website: normalizeSiteUrl(storedDomain),
  });
  if (!detected.ok) {
    return {
      status: 'error',
      message: detected.message,
      draft: { intent: 'agency', name: parsed.data.name, website: storedDomain },
    };
  }
  if (parsed.data.confirmed !== '1') {
    return {
      status: 'needs_confirmation',
      proposal: detected.proposal,
      message: 'Confirm the market GEO-Pulse will measure for this client.',
    };
  }

  // The cohort the agency already curated belongs to this client's profile, not to
  // a delivery setting. Carrying it into the confirmed context is what puts it in
  // the measurement binding; leaving it behind is why confirmed clients measured
  // against nobody.
  const approvedCompetitorDomains = await loadClientCompetitorCohort(
    context.adminDb,
    parsed.data.agencyAccountId,
    storedDomain,
  );

  const confirmation = confirmOrganizationOnboarding(detected.proposal, parsed.data);
  if (!confirmation.ok) {
    return {
      status: 'needs_confirmation',
      proposal: { ...detected.proposal, missingFields: confirmation.missingFields },
      message: 'Answer the remaining question before the baseline can run.',
    };
  }
  const confirmed = confirmation.value;

  let organizationContext: Awaited<ReturnType<typeof persistConfirmedOrganizationContext>>;
  try {
    organizationContext = await persistConfirmedOrganizationContext({
      supabase: context.adminDb,
      input: {
        ownerType: 'agency_client',
        ownerId: String(client.id),
        actorId: context.userId,
        canonicalDomain: storedDomain,
        displayName: confirmed.displayName,
        category: confirmed.category,
        services: confirmed.services,
        buyer: confirmed.buyer,
        marketScope: confirmed.marketScope,
        countryCode: confirmed.countryCode,
        subdivisionCode: confirmed.subdivisionCode,
        locality: confirmed.locality,
        serviceAreas: confirmed.serviceAreas,
        languages: confirmed.languages,
        timezone: confirmed.timezone,
        approvedCompetitorDomains,
        source: 'agency_client_market_confirmation',
      },
    });
  } catch {
    return {
      status: 'error',
      message: 'The market confirmation could not be saved. Try again to resume safely.',
      draft: { intent: 'agency', name: confirmed.displayName, website: storedDomain },
    };
  }

  // Not an activation event: that taxonomy marks a baseline starting, and this
  // only restores the context one needs. A log keeps the confirmation traceable
  // without widening the marketing event set.
  structuredLog('agency_client_market_confirmed', {
    agency_account_id: parsed.data.agencyAccountId,
    agency_client_id: String(client.id),
    canonical_domain: storedDomain,
    context_version: organizationContext.contextVersion,
  });

  revalidatePath('/dashboard/clients');
  revalidatePath('/dashboard/visibility');
  revalidatePath(`/dashboard/clients/${client.id}`);
  // The baseline is deliberately not run here. It spends against the GPM cap, so
  // it stays an explicit action on the client page.
  redirect(
    `/dashboard/clients/${client.id}?agencyAccount=${parsed.data.agencyAccountId}&market=confirmed`
  );
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
