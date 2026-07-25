import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/062_intelligence_evidence_catalog.sql'),
  'utf8'
);

describe('evidence catalog schema', () => {
  it('models recoverable objects, lineage, access, and missing artifacts', () => {
    expect(migration).toContain('CREATE TABLE public.intelligence_evidence_objects');
    expect(migration).toContain('CREATE TABLE public.intelligence_evidence_edges');
    expect(migration).toContain('stable_evidence_id');
    expect(migration).toContain('content_hash');
    expect(migration).toContain("'original', 'extracted', 'parsed', 'computed', 'generated'");
    expect(migration).toContain("'present', 'missing', 'unverified'");
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).not.toContain('DELETE FROM');
    expect(migration).not.toContain('storage.objects');
  });
});
