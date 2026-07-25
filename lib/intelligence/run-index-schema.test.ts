import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '061_intelligence_run_index.sql'),
  'utf8'
);

describe('canonical run index schema', () => {
  it('keeps reversible and idempotent source pointers', () => {
    expect(migration).toContain('source_kind TEXT NOT NULL');
    expect(migration).toContain('source_table TEXT NOT NULL');
    expect(migration).toContain('source_id TEXT NOT NULL');
    expect(migration).toContain('UNIQUE (source_kind, source_id)');
  });

  it('supports parent, identity, lane, window, tenant, and artifact lineage', () => {
    expect(migration).toContain('parent_run_id UUID REFERENCES public.intelligence_runs');
    expect(migration).toContain('canonical_domain_id UUID');
    expect(migration).toContain('lane_id UUID');
    expect(migration).toContain('artifact_ref TEXT');
    expect(migration).toContain('intelligence_runs_tenant_shape_check');
  });

  it('has restartable reconciliation checkpoints and service-role boundaries', () => {
    expect(migration).toContain('CREATE TABLE public.intelligence_backfill_checkpoints');
    expect(migration).toContain('source_snapshot TEXT');
    expect(migration).toContain('ALTER TABLE public.intelligence_runs ENABLE ROW LEVEL SECURITY');
    expect(migration).not.toMatch(/CREATE POLICY/i);
  });
});
