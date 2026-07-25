import { describe, expect, it } from 'vitest';
import {
  INTELLIGENCE_SOURCE_REGISTRY,
  postgresIntelligenceSources,
  validateIntelligenceSourceRegistry,
} from './source-registry';

describe('intelligence source registry', () => {
  it('is internally valid', () => {
    expect(validateIntelligenceSourceRegistry()).toEqual([]);
  });

  it('covers the required measurement and learning tables', () => {
    const ids = new Set(INTELLIGENCE_SOURCE_REGISTRY.map((source) => source.id));
    const required = [
      'public.scans',
      'public.scan_runs',
      'public.scan_pages',
      'public.reports',
      'public.benchmark_domains',
      'public.benchmark_query_sets',
      'public.benchmark_queries',
      'public.benchmark_run_groups',
      'public.query_runs',
      'public.query_citations',
      'public.benchmark_domain_metrics',
      'public.report_eval_runs',
      'public.retrieval_eval_runs',
      'public.startup_recommendations',
      'public.startup_recommendation_status_events',
      'public.startup_agent_pr_runs',
      'public.recurring_audit_schedules',
      'public.monitoring_subscriptions',
      'worker.scan_report_queue',
      'worker.distribution_queue',
      'worker.cron',
      'r2.audit_artifacts',
      'public.intelligence_evidence_objects',
      'public.intelligence_evidence_edges',
    ];

    for (const id of required) expect(ids.has(id), id).toBe(true);
  });

  it('keeps postgres sources queryable by schema and table', () => {
    expect(postgresIntelligenceSources().length).toBeGreaterThan(20);
    for (const source of postgresIntelligenceSources()) {
      expect(source.schema).toMatch(/^(public|analytics)$/);
      expect(source.table.length).toBeGreaterThan(0);
    }
  });
});
