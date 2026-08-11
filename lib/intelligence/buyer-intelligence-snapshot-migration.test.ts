import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/086_buyer_intelligence_snapshots.sql'), 'utf8');

describe('buyer intelligence snapshot migration', () => {
  it('creates an append-only service-role repository', () => {
    expect(sql).toContain('CREATE TABLE public.buyer_intelligence_snapshots');
    expect(sql).toContain('ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('REVOKE ALL ON public.buyer_intelligence_snapshots FROM PUBLIC, anon, authenticated, service_role');
    expect(sql).toContain('GRANT SELECT, INSERT ON public.buyer_intelligence_snapshots TO service_role');
    expect(sql).toContain('BEFORE UPDATE OR DELETE ON public.buyer_intelligence_snapshots');
    expect(sql).toContain('BEFORE INSERT ON public.buyer_intelligence_snapshots');
    expect(sql).toContain('previous.owner_id IS NOT DISTINCT FROM NEW.owner_id');
    expect(sql).toContain('previous.organization_identity_id = NEW.organization_identity_id');
  });

  it('binds indexed columns to the canonical JSON payload', () => {
    for (const expression of [
      "snapshot ->> 'snapshotId' = snapshot_id",
      "snapshot #>> '{owner,type}' = owner_type",
      "snapshot #>> '{organization,identityId}' = organization_identity_id::text",
      "snapshot #>> '{organization,contextVersion}' = context_version",
      "(snapshot #>> '{period,start}')::timestamptz = period_start",
      "snapshot #>> '{provenance,inputFingerprint}' = input_fingerprint",
    ]) expect(sql).toContain(expression);
  });
});
