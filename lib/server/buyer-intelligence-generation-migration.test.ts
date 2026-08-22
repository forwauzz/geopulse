import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/087_buyer_intelligence_generations.sql'), 'utf8');

describe('buyer intelligence generation migration', () => {
  it('keeps the ledger service-role only and tenant-linked', () => {
    expect(sql).toContain('REFERENCES public.agency_accounts(id)');
    expect(sql).toContain('REFERENCES public.agency_clients(id)');
    expect(sql).toContain('REFERENCES public.buyer_intelligence_snapshots(snapshot_id)');
    expect(sql).toContain('REVOKE ALL ON public.buyer_intelligence_generations FROM PUBLIC, anon, authenticated, service_role');
    expect(sql).toContain('GRANT SELECT, INSERT, UPDATE ON public.buyer_intelligence_generations TO service_role');
    expect(sql).not.toContain('GRANT DELETE');
  });

  it('enforces immutable lineage, eligible snapshots, and legal transitions', () => {
    expect(sql).toContain("snapshot.report_eligibility = 'eligible'");
    expect(sql).toContain('buyer intelligence generation lineage is immutable');
    expect(sql).toContain("OLD.status = 'failed' AND NEW.status = 'queued'");
    expect(sql).toContain('status = \'succeeded\' OR artifact_r2_key IS NULL');
  });
});
