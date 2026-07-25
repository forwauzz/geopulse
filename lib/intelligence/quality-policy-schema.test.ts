import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/063_intelligence_quality_policy.sql'),
  'utf8'
);

describe('quality policy schema', () => {
  it('keeps classification and quarantine append-only and auditable', () => {
    expect(migration).toContain('intelligence_run_quality_classifications');
    expect(migration).toContain('intelligence_window_quality_assessments');
    expect(migration).toContain('intelligence_quarantine_events');
    expect(migration).toContain('intelligence_quality_alerts');
    expect(migration).toContain('original_status');
    expect(migration).toContain("'quarantine', 'release', 'validate'");
    expect(migration).not.toContain('UPDATE public.intelligence_runs');
    expect(migration).not.toContain('DELETE FROM');
  });
});
