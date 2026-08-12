import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(join(process.cwd(), 'supabase/migrations/089_brevo_partner_connector.sql'), 'utf8');

describe('Brevo connector migration', () => {
  it('keeps credentials and contacts service-role only', () => {
    expect(sql).toContain('REVOKE ALL ON public.crm_connector_credentials FROM PUBLIC, anon, authenticated');
    expect(sql).toContain('REVOKE ALL ON public.crm_prospect_batch_contacts FROM PUBLIC, anon, authenticated');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.create_crm_held_batch');
    expect(sql).not.toContain('GRANT SELECT ON public.crm_connector_credentials TO authenticated');
  });

  it('binds connections and held batches to one agency account', () => {
    expect(sql).toContain('UNIQUE (agency_account_id, provider)');
    expect(sql).toContain("account.agency_account_id = p_agency_account_id");
    expect(sql).toContain("account.status = 'connected'");
    expect(sql).toContain('v_count < 1 OR v_count > 10');
    expect(sql).toContain('UNIQUE (agency_account_id, connector_account_id, provider_contact_id)');
  });
});
