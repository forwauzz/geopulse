import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/064_intelligence_analytical_marts.sql'),
  'utf8'
);

describe('analytical mart definitions', () => {
  it.each([
    'intelligence_mart_domain_measurement_timeline',
    'intelligence_mart_lane_window_health',
    'intelligence_mart_domain_query_model_outcomes',
    'intelligence_mart_domain_page_feature_snapshots',
    'intelligence_mart_intervention_outcomes',
  ])('defines %s', (view) => {
    expect(migration).toContain(`VIEW public.${view}`);
  });

  it('carries lineage, eligibility, compatibility, sample, uncertainty, and availability', () => {
    for (const field of [
      'source_run_ids', 'source_evidence_ids', 'eligible', 'comparison_label',
      'sample_size', 'uncertainty_low', 'uncertainty_high', "'not_available'",
    ]) expect(migration).toContain(field);
    expect(migration).not.toContain('DELETE FROM');
    expect(migration).toContain('security_invoker = true');
    expect(migration).toContain('REVOKE ALL');
  });
});
