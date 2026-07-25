import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '059_intelligence_identity.sql'),
  'utf8'
);

describe('intelligence identity schema boundaries', () => {
  it.each([
    'intelligence_domains',
    'intelligence_domain_aliases',
    'intelligence_domain_owners',
    'intelligence_pages',
    'intelligence_source_identity_maps',
  ])('enables RLS for %s', (table) => {
    expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
  });

  it('does not expose permissive tenant policies from the canonical store', () => {
    expect(migration).not.toMatch(/CREATE POLICY/i);
  });

  it('requires explicit ownership and visibility shapes', () => {
    expect(migration).toContain('intelligence_domain_owners_shape_check');
    expect(migration).toContain("visibility IN ('tenant', 'internal', 'shared')");
    expect(migration).toContain("owner_type = 'internal_benchmark' AND owner_id IS NULL");
  });

  it('keeps ambiguous aliases reviewable instead of forcing a global unique alias', () => {
    expect(migration).toContain('UNIQUE (domain_id, alias_host)');
    expect(migration).not.toContain('UNIQUE (alias_host)');
    expect(migration).toContain("'needs_review'");
  });
});
