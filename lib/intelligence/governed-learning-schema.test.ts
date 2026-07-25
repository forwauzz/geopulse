import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('governed learning migration', () => {
  const sql = readFileSync(
    join(process.cwd(), 'supabase/migrations/066_intelligence_governed_learning.sql'),
    'utf8'
  );

  it('creates the pattern, proposal, eval lineage, policy and audit registries', () => {
    for (const table of [
      'intelligence_learning_patterns',
      'intelligence_methodology_proposals',
      'intelligence_methodology_eval_links',
      'intelligence_policy_versions',
      'intelligence_methodology_events',
    ]) {
      expect(sql).toContain(`CREATE TABLE public.${table}`);
      expect(sql).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    }
  });

  it('enforces holdout, shadow, human approval and rollback gates at the database boundary', () => {
    expect(sql).toContain('intelligence_methodology_holdout_gate');
    expect(sql).toContain('intelligence_methodology_shadow_gate');
    expect(sql).toContain('intelligence_methodology_human_gate');
    expect(sql).toContain('intelligence_methodology_rollback_target');
    expect(sql).toContain('intelligence_methodology_stage_evidence_gate');
    expect(sql).toContain('intelligence_policy_activation_gate');
    expect(sql).toContain('intelligence_policy_versions_one_active_idx');
    expect(sql).toContain('FUNCTION public.rollback_intelligence_policy');
    expect(sql).toContain("SET status = 'rolled_back'");
    expect(sql).toContain("SET status = 'active'");
    expect(sql).toContain('prevent_intelligence_methodology_event_mutation');
    expect(sql).toContain('BEFORE UPDATE OR DELETE');
  });

  it('retains eval lineage without mutating original eval rows', () => {
    expect(sql).toContain("eval_type IN ('report', 'retrieval', 'custom_holdout')");
    expect(sql).toContain('rubric_version TEXT NOT NULL');
    expect(sql).toContain('generator_version TEXT NOT NULL');
    expect(sql).toContain('source_snapshot TEXT NOT NULL');
    expect(sql).not.toMatch(/UPDATE public\.(report_eval_runs|retrieval_eval_runs)/);
  });
});
