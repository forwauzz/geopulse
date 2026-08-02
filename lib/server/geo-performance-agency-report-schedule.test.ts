import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  store: vi.fn(),
  querySet: null as null | { version: string; metadata: Record<string, unknown> },
}));

vi.mock('./benchmark-repository', () => ({
  createBenchmarkRepository: vi.fn(() => ({
    getDomainById: vi.fn(async () => ({ canonical_domain: 'clinic.example' })),
    getRunGroupByScheduleKey: vi.fn(async () => null),
    getQuerySetById: vi.fn(async () => mocks.querySet),
  })),
}));
vi.mock('./benchmark-runner', () => ({
  runBenchmarkGroupSkeleton: mocks.run,
}));
vi.mock('./agency-report-store', () => ({
  storeAgencyReport: mocks.store,
}));
vi.mock('./geo-performance-slack', () => ({
  sendGpmReportSlackSummary: vi.fn(),
}));

import { executeGpmClientRun } from './geo-performance-schedule';
import {
  deriveOrganizationMeasurementBinding,
  organizationMeasurementMetadata,
} from '../intelligence/organization-measurement-context';
import {
  organizationContextContentHash,
  organizationContextSchema,
  organizationContextVersion,
} from '../intelligence/organization-context';

function context() {
  const base = {
    contractVersion: 'organization-context-v1', policyVersion: 'organization-context-precedence-v1',
    contextId: 'oc:11111111-1111-4111-8111-111111111111:agency_account:22222222-2222-4222-8222-222222222222',
    owner: { type: 'agency_account' as const, id: '22222222-2222-4222-8222-222222222222' },
    organization: { identityId: '11111111-1111-4111-8111-111111111111', displayName: 'Clinic', canonicalDomain: 'clinic.example', aliases: [], category: 'specialist care', services: [] },
    market: { scope: 'local' as const, countryCode: 'CA', subdivisionCode: 'CA-ON', locality: 'Toronto', serviceAreas: [], languages: ['en-CA'], timezone: 'America/Toronto', buyer: 'patients', approvedCompetitorDomains: [] },
    status: 'confirmed' as const, evidence: [], conflicts: [],
    confirmation: { actorType: 'user' as const, actorId: '33333333-3333-4333-8333-333333333333', confirmedAt: '2026-08-01T00:00:00.000Z' },
    versionReasonCodes: ['tenant_confirmation' as const], projectedAt: '2026-08-01T00:00:00.000Z',
  };
  const contentHash = organizationContextContentHash({ ...base, projectedAt: undefined });
  return organizationContextSchema.parse({ ...base, contentHash, contextVersion: organizationContextVersion(contentHash) });
}

describe('GPM agency artifact schedule', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.querySet = null;
  });

  it('waits for every provider and stores one combined report with all successful run ids', async () => {
    mocks.run.mockImplementation(async (_supabase, input: { modelId: string }) => ({
      runGroupId: input.modelId.includes('gemini') ? 'run-gemini' : 'run-chatgpt',
      completedQueryCount: 2,
    }));
    mocks.store.mockResolvedValue({ created: false, reportId: 'report-1' });
    const organizationContext = context();
    const derived = deriveOrganizationMeasurementBinding(organizationContext);
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    const measurementMetadata = organizationMeasurementMetadata(derived.binding);
    mocks.querySet = { version: derived.binding.querySetVersion, metadata: measurementMetadata };
    const config = {
      id: 'config-1', startup_workspace_id: null, agency_account_id: 'agency-1', benchmark_domain_id: 'domain-1',
      topic: 'specialist care', location: 'Toronto', query_set_id: 'set-1', competitor_list: [], cadence: 'monthly' as const,
      platforms_enabled: ['chatgpt', 'gemini'], report_email: null, metadata: { prompt_count: 2, ...measurementMetadata },
      created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z',
    };
    const result = await executeGpmClientRun({
      supabase: {},
      config,
      entitlement: {
        enabled: true, tier: 'agency_pro', maxPromptsPerRun: null, allowedCadences: ['monthly'],
        deliverySurfaces: ['email'], platformsAllowed: ['chatgpt', 'gemini', 'perplexity'], source: 'bundle_service',
      },
      platformModelMap: { chatgpt: 'gpt-test', gemini: 'gemini-test', perplexity: 'sonar-test' },
      adapter: {} as never,
      now: new Date('2026-08-01T12:00:00.000Z'),
      reportEnv: { GPM_REPORT_DELIVERY_ENABLED: 'false' },
      organizationContext,
    });

    expect(result.platformResults).toHaveLength(2);
    expect(mocks.run).toHaveBeenCalledTimes(2);
    expect(mocks.store).toHaveBeenCalledTimes(1);
    expect(mocks.store).toHaveBeenCalledWith(expect.objectContaining({
      platformRuns: [
        { platform: 'chatgpt', runGroupId: 'run-chatgpt' },
        { platform: 'gemini', runGroupId: 'run-gemini' },
      ],
    }));
    expect(mocks.store.mock.invocationCallOrder[0]).toBeGreaterThan(mocks.run.mock.invocationCallOrder.at(-1)!);
  });

  it('fails closed before provider work when the active context is not confirmed', async () => {
    const detected = { ...context(), status: 'detected' as const, confirmation: null };
    const result = await executeGpmClientRun({
      supabase: {},
      config: {
        id: 'config-1', startup_workspace_id: null, agency_account_id: 'agency-1', benchmark_domain_id: 'domain-1',
        topic: 'specialist care', location: 'Toronto', query_set_id: 'set-1', competitor_list: [], cadence: 'monthly',
        platforms_enabled: ['gemini'], report_email: null, metadata: { prompt_count: 2 },
        created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z',
      },
      entitlement: {
        enabled: true, tier: 'agency_pro', maxPromptsPerRun: null, allowedCadences: ['monthly'],
        deliverySurfaces: [], platformsAllowed: ['gemini'], source: 'bundle_service',
      },
      platformModelMap: { chatgpt: 'gpt-test', gemini: 'gemini-test', perplexity: 'sonar-test' },
      adapter: {} as never,
      organizationContext: detected,
    });
    expect(result.contextBlocked).toBe(true);
    expect(result.contextBlockReasons).toContain('context_not_confirmed');
    expect(mocks.run).not.toHaveBeenCalled();
    expect(mocks.store).not.toHaveBeenCalled();
  });

  it('requires a fresh baseline when the config and query set belong to an older context', async () => {
    const organizationContext = context();
    const derived = deriveOrganizationMeasurementBinding(organizationContext);
    expect(derived.ok).toBe(true);
    if (!derived.ok) return;
    const staleMetadata = {
      ...organizationMeasurementMetadata(derived.binding),
      organization_context_version: 'ocv1-deadbeef',
    };
    mocks.querySet = { version: 'oqs1-deadbeef-g1', metadata: staleMetadata };
    const result = await executeGpmClientRun({
      supabase: {},
      config: {
        id: 'config-1', startup_workspace_id: null, agency_account_id: 'agency-1', benchmark_domain_id: 'domain-1',
        topic: 'specialist care', location: 'Toronto', query_set_id: 'set-old', competitor_list: [], cadence: 'monthly',
        platforms_enabled: ['gemini'], report_email: null, metadata: staleMetadata,
        created_at: '2026-08-01T00:00:00.000Z', updated_at: '2026-08-01T00:00:00.000Z',
      },
      entitlement: {
        enabled: true, tier: 'agency_pro', maxPromptsPerRun: null, allowedCadences: ['monthly'],
        deliverySurfaces: [], platformsAllowed: ['gemini'], source: 'bundle_service',
      },
      platformModelMap: { chatgpt: 'gpt-test', gemini: 'gemini-test', perplexity: 'sonar-test' },
      adapter: {} as never,
      organizationContext,
    });
    expect(result.contextBlocked).toBe(true);
    expect(result.baselineRequired).toBe(true);
    expect(result.contextBlockReasons).toContain('query_set_version_mismatch');
    expect(mocks.run).not.toHaveBeenCalled();
  });
});
