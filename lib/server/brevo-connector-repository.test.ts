import { describe, expect, it } from 'vitest';
import { createBrevoConnectorRepository } from './brevo-connector-repository';

function query(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'is', 'gt', 'in', 'order', 'limit']) {
    chain[method] = () => chain;
  }
  chain.maybeSingle = async () => result;
  return chain;
}

describe('brevo connector repository', () => {
  it('loads a held contact only through its tenant and batch lineage', async () => {
    const row = {
      batch_id: '00000000-0000-4000-8000-000000000010',
      provider_contact_id: '1592', first_name: 'Uzziel', company_name: 'Alie',
      canonical_domain: 'alie.app', email: 'uzziel.tamon@alie.app',
    };
    const supabase = { from: () => query({ data: row, error: null }) };
    const contact = await createBrevoConnectorRepository(supabase).loadHeldContact({
      agencyAccountId: '00000000-0000-4000-8000-000000000002',
      batchId: row.batch_id,
      providerContactId: row.provider_contact_id,
    });
    expect(contact).toEqual({
      providerContactId: '1592', firstName: 'Uzziel', companyName: 'Alie',
      canonicalDomain: 'alie.app', email: 'uzziel.tamon@alie.app',
    });
  });

  it('normalizes Postgres offset timestamps at the connector boundary', async () => {
    const account = {
      id: '00000000-0000-4000-8000-000000000001',
      agency_account_id: '00000000-0000-4000-8000-000000000002',
      external_account_id: 'brevo-account',
      credential_ref: '00000000-0000-4000-8000-000000000003',
      scopes: ['contacts:read'],
      status: 'connected',
      connected_at: '2026-08-12T02:00:00+00:00',
      disconnected_at: null,
      last_error_code: null,
    };
    const credential = {
      id: account.credential_ref,
      access_token_encrypted: 'encrypted',
      refresh_token_encrypted: null,
      expires_at: '2026-08-12T03:00:00+00:00',
      updated_at: '2026-08-12T02:00:00+00:00',
    };
    const supabase = {
      from(table: string) {
        return query({ data: table === 'crm_connector_accounts' ? account : credential, error: null });
      },
    };

    const connection = await createBrevoConnectorRepository(supabase).load(account.agency_account_id);

    expect(connection?.account.connectedAt).toBe('2026-08-12T02:00:00.000Z');
    expect(connection?.account.expiresAt).toBe('2026-08-12T03:00:00.000Z');
  });
});
