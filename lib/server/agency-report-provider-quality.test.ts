import { describe, expect, it } from 'vitest';
import type { ClientBenchmarkConfigRow } from './benchmark-repository';
import { assessAgencyReportProviderQuality } from './agency-report-provider-quality';

const config: ClientBenchmarkConfigRow = {
  id: 'config-1',
  startup_workspace_id: null,
  agency_account_id: 'agency-1',
  benchmark_domain_id: 'domain-1',
  topic: 'managed IT services',
  location: 'Montreal',
  query_set_id: 'set-1',
  competitor_list: [],
  cadence: 'monthly',
  platforms_enabled: ['gemini', 'perplexity'],
  report_email: null,
  metadata: {},
  created_at: '2026-08-01T00:00:00.000Z',
  updated_at: '2026-08-01T00:00:00.000Z',
};

const group = {
  id: 'group-1',
  query_set_id: 'set-1',
  status: 'completed',
  metadata: { run_mode: 'blind_discovery' },
  startup_workspace_id: null,
  agency_account_id: 'agency-1',
};

function run(id: string, queryId: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    query_id: queryId,
    model_id: 'provider-model',
    status: 'completed',
    response_text: `Answer for ${queryId}`,
    response_metadata: {},
    error_message: null,
    executed_at: '2026-08-01T12:00:00.000Z',
    created_at: '2026-08-01T11:59:00.000Z',
    ...overrides,
  };
}

describe('assessAgencyReportProviderQuality', () => {
  it('keeps completed answers with zero citations as a measured provider', () => {
    const quality = assessAgencyReportProviderQuality({
      platformRun: { platform: 'gemini', runGroupId: 'group-1' },
      config,
      group,
      expectedQueryIds: ['q1', 'q2'],
      runs: [run('run-1', 'q1'), run('run-2', 'q2')],
      citations: [],
    });

    expect(quality).toEqual({
      platform: 'gemini',
      runGroupId: 'group-1',
      status: 'measured',
      expectedQueryCount: 2,
      validQueryCount: 2,
      reasonCodes: [],
    });
  });

  it('makes failed and missing-response provider runs unavailable', () => {
    const quality = assessAgencyReportProviderQuality({
      platformRun: { platform: 'gemini', runGroupId: 'group-1' },
      config,
      group,
      expectedQueryIds: ['q1', 'q2'],
      runs: [
        run('run-1', 'q1', { status: 'failed', error_message: 'provider unavailable', response_text: null }),
        run('run-2', 'q2', { response_text: null }),
      ],
      citations: [],
    });

    expect(quality.status).toBe('unavailable');
    expect(quality.validQueryCount).toBe(0);
    expect(quality.reasonCodes).toEqual(expect.arrayContaining([
      'provider_error',
      'missing_response',
      'query_coverage_incomplete',
    ]));
  });

  it('fails closed on incomplete, duplicate, or unexpected query coverage', () => {
    const quality = assessAgencyReportProviderQuality({
      platformRun: { platform: 'perplexity', runGroupId: 'group-1' },
      config,
      group,
      expectedQueryIds: ['q1', 'q2'],
      runs: [run('run-1', 'q1'), run('run-2', 'q1'), run('run-3', 'q3')],
      citations: [],
    });

    expect(quality.status).toBe('unavailable');
    expect(quality.validQueryCount).toBe(0);
    expect(quality.reasonCodes).toEqual(expect.arrayContaining([
      'duplicate_query_measurement',
      'query_coverage_incomplete',
      'unexpected_query',
    ]));
  });

  it('rejects a completed-looking group from the wrong tenant or query set', () => {
    const quality = assessAgencyReportProviderQuality({
      platformRun: { platform: 'perplexity', runGroupId: 'group-1' },
      config,
      group: { ...group, agency_account_id: 'agency-2', query_set_id: 'set-2' },
      expectedQueryIds: ['q1'],
      runs: [run('run-1', 'q1')],
      citations: [],
    });

    expect(quality.status).toBe('unavailable');
    expect(quality.reasonCodes).toEqual(expect.arrayContaining(['tenant_mismatch', 'query_set_mismatch']));
  });
});
