import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/090_brevo_report_delivery.sql'), 'utf8');

describe('Brevo report delivery migration', () => {
  it('enforces tenant lineage, one delivery per contact-generation, and service-role-only access', () => {
    expect(sql).toContain('UNIQUE (connector_account_id, provider_contact_id, generation_id)');
    expect(sql).toContain("batch.status = 'held'");
    expect(sql).toContain("generation.status = 'succeeded'");
    expect(sql).toContain('ALTER TABLE public.crm_report_deliveries ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('REVOKE ALL ON public.crm_report_deliveries FROM PUBLIC, anon, authenticated, service_role');
  });
});
