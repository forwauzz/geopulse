import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '060_intelligence_measurement_lanes.sql'),
  'utf8'
);

describe('measurement lane schema', () => {
  it.each([
    'intelligence_measurement_lanes',
    'intelligence_measurement_windows',
    'intelligence_measurement_run_mappings',
  ])('keeps %s service-role only', (table) => {
    expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
  });

  it('freezes protocol and expected/observed window coverage', () => {
    expect(migration).toContain('protocol JSONB NOT NULL');
    expect(migration).toContain("expected_coverage JSONB NOT NULL");
    expect(migration).toContain("observed_coverage JSONB NOT NULL");
    expect(migration).toContain('UNIQUE (lane_id, window_key)');
  });

  it('represents unknown and quarantined histories explicitly', () => {
    expect(migration).toContain("'legacy_unknown'");
    expect(migration).toContain("'quarantined'");
    expect(migration).toContain("'needs_review'");
  });
});
