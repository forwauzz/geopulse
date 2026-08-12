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
