import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  run: vi.fn(),
  store: vi.fn(),
}));

vi.mock('./benchmark-repository', () => ({
  createBenchmarkRepository: vi.fn(() => ({
    getDomainById: vi.fn(async () => ({ canonical_domain: 'clinic.example' })),
    getRunGroupByScheduleKey: vi.fn(async () => null),
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

describe('GPM agency artifact schedule', () => {
  it('waits for every provider and stores one combined report with all successful run ids', async () => {
    mocks.run.mockImplementation(async (_supabase, input: { modelId: string }) => ({
      runGroupId: input.modelId.includes('gemini') ? 'run-gemini' : 'run-chatgpt',
      completedQueryCount: 2,
    }));
    mocks.store.mockResolvedValue({ created: false, reportId: 'report-1' });
    const config = {
      id: 'config-1', startup_workspace_id: null, agency_account_id: 'agency-1', benchmark_domain_id: 'domain-1',
      topic: 'specialist care', location: 'Toronto', query_set_id: 'set-1', competitor_list: [], cadence: 'monthly' as const,
      platforms_enabled: ['chatgpt', 'gemini'], report_email: null, metadata: { prompt_count: 2 },
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
});
