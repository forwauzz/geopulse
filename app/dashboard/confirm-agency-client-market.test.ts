/**
 * Coverage for confirming market context on a client that already exists.
 *
 * The tenant boundary and the domain source are the two things that must not
 * regress: confirming for another agency's client would leak context across
 * tenants, and confirming against a form-supplied host would write a context
 * the baseline never reads, leaving the client silently unmeasurable again.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { ResolveValueFirstProposalResult } from '@/lib/server/value-first-onboarding';

vi.mock('server-only', () => ({}));

const REDIRECT = Symbol('redirect');
const redirect = vi.fn((url: string) => {
  throw Object.assign(new Error(String(url)), { [REDIRECT]: true });
});
vi.mock('next/navigation', () => ({ redirect }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const validateAgencyContext = vi.fn(async () => true);
vi.mock('@/lib/server/agency-access', () => ({
  validateAgencyContext,
  resolveAgencyFeatureEntitlements: vi.fn(async () => ({ agencyDashboardEnabled: true })),
}));

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: { getUser: async () => ({ data: { user: { id: USER_ID, email: 'jack@lifter.ca' } } }) },
  })),
}));

const persistConfirmedOrganizationContext = vi.fn(async () => ({ contextVersion: 'ocv1-test' }));
vi.mock('@/lib/server/organization-context-repository', () => ({
  persistConfirmedOrganizationContext,
}));

const resolveValueFirstOnboardingProposal = vi.fn(async (args: { website: string }): Promise<ResolveValueFirstProposalResult> => ({
  ok: true as const,
  proposal: {
    version: 'value-first-onboarding-v1',
    intent: 'agency',
    submittedName: 'SanoMed Solutions',
    submittedWebsite: args.website,
    displayName: 'SanoMed Solutions',
    canonicalDomain: 'sanomedsolutions.com',
    category: 'private medical clinic',
    services: ['preventive medicine'],
    buyer: 'patients seeking private medical care',
    marketScope: 'local',
    countryCode: 'CA',
    subdivisionCode: 'CA-QC',
    locality: 'Pointe-Claire',
    serviceAreas: ["Montreal's West Island"],
    languages: ['en-CA', 'fr-CA'],
    timezone: 'America/Toronto',
    confidence: 0.9,
    resolverStatus: 'proposed',
    reasonCodes: [],
    limitations: [],
    missingFields: [],
  },
}));
vi.mock('@/lib/server/value-first-onboarding', () => ({ resolveValueFirstOnboardingProposal }));

const USER_ID = '30000000-0000-4000-8000-000000000001';
const AGENCY_ID = '30000000-0000-4000-8000-000000000002';
const CLIENT_ID = '30000000-0000-4000-8000-000000000003';

/** Mirrors the real filter chain so an out-of-scope client resolves to no row. */
let clientRow: Record<string, unknown> | null = null;
const createServiceRoleClient = vi.fn(() => ({
  from: (table: string) => {
    const filters: Record<string, unknown> = {};
    const builder: Record<string, unknown> = {
      select: () => builder,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return builder;
      },
      maybeSingle: async () => {
        if (table === 'agency_users') {
          const member = filters['agency_account_id'] === AGENCY_ID && filters['user_id'] === USER_ID;
          return { data: member ? { role: 'admin', status: 'active' } : null, error: null };
        }
        const scoped =
          clientRow &&
          filters['id'] === clientRow['id'] &&
          filters['agency_account_id'] === AGENCY_ID;
        return { data: scoped ? clientRow : null, error: null };
      },
    };
    return builder;
  },
}));
vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient }));

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.append(key, value);
  return data;
}

const confirmedForm = (overrides: Record<string, string> = {}) => form({
  agencyAccountId: AGENCY_ID,
  agencyClientId: CLIENT_ID,
  intent: 'agency',
  name: 'SanoMed Solutions',
  confirmed: '1',
  ...overrides,
});

describe('confirmAgencyClientMarket', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // stubEnv rather than assignment: the project types process.env keys as
    // literal values, so a direct assignment fails type-check in CI.
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    validateAgencyContext.mockResolvedValue(true);
    persistConfirmedOrganizationContext.mockResolvedValue({ contextVersion: 'ocv1-test' });
    clientRow = {
      id: CLIENT_ID,
      name: 'SanoMed Solutions',
      display_name: 'SanoMed Solutions',
      canonical_domain: 'sanomedsolutions.com',
      website_domain: 'sanomedsolutions.com',
      vertical: 'healthcare',
      subvertical: 'private medical clinic',
      metadata: { location: 'Pointe-Claire' },
    };
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('resolves an absolute URL, since the SSRF validator throws on a bare host', async () => {
    const { confirmAgencyClientMarket } = await import('./actions');
    await expect(confirmAgencyClientMarket(null, confirmedForm())).rejects.toThrow();

    expect(resolveValueFirstOnboardingProposal).toHaveBeenCalledWith(
      expect.objectContaining({ website: 'https://sanomedsolutions.com/' }),
    );
  });

  it('confirms against the stored client domain, not one supplied by the form', async () => {
    const { confirmAgencyClientMarket } = await import('./actions');
    await expect(
      confirmAgencyClientMarket(null, confirmedForm({ website: 'attacker-controlled.com' })),
    ).rejects.toThrow();

    expect(resolveValueFirstOnboardingProposal).toHaveBeenCalledWith(
      expect.objectContaining({ website: 'https://sanomedsolutions.com/' }),
    );
    expect(persistConfirmedOrganizationContext).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.objectContaining({
          ownerType: 'agency_client',
          ownerId: CLIENT_ID,
          canonicalDomain: 'sanomedsolutions.com',
          actorId: USER_ID,
        }),
      }),
    );
  });

  it('refuses a client that belongs to another agency account', async () => {
    clientRow = { ...clientRow!, id: '30000000-0000-4000-8000-0000000000ff' };
    const { confirmAgencyClientMarket } = await import('./actions');
    const result = await confirmAgencyClientMarket(null, confirmedForm());

    expect(result).toEqual({
      status: 'error',
      message: 'That client is not available on this agency account.',
    });
    expect(persistConfirmedOrganizationContext).not.toHaveBeenCalled();
  });

  it('refuses when the caller is not a member of the agency account', async () => {
    validateAgencyContext.mockResolvedValue(false);
    const { confirmAgencyClientMarket } = await import('./actions');
    const result = await confirmAgencyClientMarket(null, confirmedForm());

    expect(result).toMatchObject({ status: 'error' });
    expect(persistConfirmedOrganizationContext).not.toHaveBeenCalled();
  });

  it('asks for confirmation before writing anything', async () => {
    const { confirmAgencyClientMarket } = await import('./actions');
    const result = await confirmAgencyClientMarket(
      null,
      confirmedForm({ confirmed: '' }),
    );

    expect(result).toMatchObject({ status: 'needs_confirmation' });
    expect(persistConfirmedOrganizationContext).not.toHaveBeenCalled();
  });

  it('uses the legacy client category and location only when site detection leaves gaps', async () => {
    resolveValueFirstOnboardingProposal.mockResolvedValueOnce({
      ok: true,
      proposal: {
        version: 'value-first-onboarding-v1',
        intent: 'agency',
        submittedName: 'SanoMed Solutions',
        submittedWebsite: 'https://sanomedsolutions.com/',
        displayName: 'SanoMed Solutions',
        canonicalDomain: 'sanomedsolutions.com',
        category: null,
        services: [],
        buyer: null,
        marketScope: null,
        countryCode: null,
        subdivisionCode: null,
        locality: null,
        serviceAreas: [],
        languages: [],
        timezone: null,
        confidence: 0.4,
        resolverStatus: 'needs_review',
        reasonCodes: ['location_missing', 'country_missing', 'market_scope_missing'],
        limitations: [],
        missingFields: ['country_code', 'market_scope', 'languages', 'timezone', 'category'],
      },
    });
    const { confirmAgencyClientMarket } = await import('./actions');
    const result = await confirmAgencyClientMarket(null, confirmedForm({ confirmed: '' }));

    expect(result).toMatchObject({
      status: 'needs_confirmation',
      proposal: {
        category: 'private medical clinic',
        serviceAreas: ['Pointe-Claire'],
      },
    });
    if (result.status === 'needs_confirmation') {
      expect(result.proposal.missingFields).not.toContain('category');
    }
    expect(persistConfirmedOrganizationContext).not.toHaveBeenCalled();
  });

  it('reports a client with no primary domain instead of confirming an empty host', async () => {
    clientRow = { ...clientRow!, canonical_domain: null, website_domain: null };
    const { confirmAgencyClientMarket } = await import('./actions');
    const result = await confirmAgencyClientMarket(null, confirmedForm());

    expect(result).toMatchObject({ status: 'error' });
    expect(persistConfirmedOrganizationContext).not.toHaveBeenCalled();
  });
});
