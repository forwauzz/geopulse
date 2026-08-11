import { describe, expect, it } from 'vitest';
import { createIntelligenceAdminData } from './admin-data';

function queryResult(result: unknown) {
  const query: Record<string, unknown> = {
    select: () => query,
    order: () => query,
    limit: () => Promise.resolve(result),
    eq: () => query,
    is: () => query,
    then(resolve: (value: unknown) => unknown) {
      return Promise.resolve(result).then(resolve);
    },
  };
  return query;
}

describe('intelligence admin data contract', () => {
  it('fails safely while the additive migration chain is pending', async () => {
    const db = {
      from() {
        return queryResult({
          data: null,
          count: null,
          error: { code: '42P01', message: 'relation does not exist' },
        });
      },
    };
    const result = await createIntelligenceAdminData(db as any).getOverview();
    expect(result.status).toBe('migration_pending');
    expect(result.data.runCount).toBe(0);
    expect(result.message).toContain('queued');
  });

  it('returns evidence metadata without selecting raw content or artifact URLs', async () => {
    const calls: string[] = [];
    const db = {
      from(table: string) {
        return {
          select(columns: string) {
            calls.push(`${table}:${columns}`);
            return queryResult({ data: [], error: null });
          },
        };
      },
    };
    const result = await createIntelligenceAdminData(db as any).getEvidence();
    expect(result.status).toBe('ready');
    expect(calls[0]).not.toContain('inline_excerpt');
    expect(calls[0]).not.toContain('artifact_ref');
    expect(calls[0]).not.toContain('tenant_id');
  });

  it('keeps pattern data read-only and explicitly causal-safe', async () => {
    const db = {
      from() {
        return {
          select() {
            return queryResult({
              data: [{
                recommendation_id: 'rec-1',
                canonical_domain_id: 'domain-1',
                metric_status: 'not_available',
                citation_rate_delta: null,
                elapsed_hours: null,
                sample_size: 0,
                comparison_label: 'not_available',
                causality_label: 'observational_association_not_causation',
              }],
              error: null,
            });
          },
        };
      },
    };
    const result = await createIntelligenceAdminData(db as any).getPatterns();
    expect(result.data[0]?.causality_label).toContain('not_causation');
    expect(result.data[0]?.citation_rate_delta).toBeNull();
  });

  it('turns aggregate MSP counts into a fail-closed claim decision', async () => {
    const row = {
      canonical_vertical: 'msp_it',
      cohort_domain_count: 127,
      scheduled_domain_count: 0,
      completed_domain_count: 0,
      eligible_window_count: 0,
      ineligible_window_count: 0,
      latest_eligible_observed_at: null,
      protocol_variant_count: 0,
      verified_intervention_count: 0,
      latest_completed_observed_at: null,
    };
    const db = {
      from() {
        return {
          select() {
            return {
              eq() { return this; },
              maybeSingle() { return Promise.resolve({ data: row, error: null }); },
            };
          },
        };
      },
    };
    const result = await createIntelligenceAdminData(db as any).getCommercialReadiness();
    expect(result.status).toBe('ready');
    expect(result.data?.assessment.aggregateClaims).toBe('blocked');
    expect(result.data?.assessment.internalEvidence).toBe('available');
  });
});
