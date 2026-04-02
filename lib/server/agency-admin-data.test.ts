import { describe, expect, it } from 'vitest';
import { createAgencyAdminData } from './agency-admin-data';

describe('createAgencyAdminData', () => {
  it('hydrates accounts with clients, users, flags, and policies', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'agency_accounts') {
          return {
            select() {
              return this;
            },
            order() {
              return Promise.resolve({
                data: [
                  {
                    id: 'acct-1',
                    account_key: 'lifter',
                    name: 'Lifter',
                    website_domain: 'lifter.ca',
                    canonical_domain: 'lifter.ca',
                    status: 'pilot',
                    billing_mode: 'pilot_exempt',
                    benchmark_vertical: 'healthcare',
                    benchmark_subvertical: 'medical_clinics',
                    metadata: null,
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                  },
                ],
                error: null,
              });
            },
          };
        }

        if (table === 'agency_clients') {
          return {
            select() {
              return this;
            },
            order() {
              return Promise.resolve({
                data: [
                  {
                    id: 'client-1',
                    agency_account_id: 'acct-1',
                    client_key: 'lifter-self',
                    name: 'Lifter',
                    display_name: 'Lifter',
                    website_domain: 'lifter.ca',
                    canonical_domain: 'lifter.ca',
                    status: 'active',
                    vertical: 'healthcare',
                    subvertical: 'medical_clinics',
                    icp_tag: 'medical_clinics',
                    metadata: null,
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                  },
                ],
                error: null,
              });
            },
          };
        }

        if (table === 'agency_users') {
          return {
            select() {
              return this;
            },
            order() {
              return Promise.resolve({
                data: [
                  {
                    id: 'membership-1',
                    agency_account_id: 'acct-1',
                    user_id: 'user-1',
                    role: 'owner',
                    status: 'active',
                    metadata: null,
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                  },
                ],
                error: null,
              });
            },
          };
        }

        if (table === 'agency_feature_flags') {
          return {
            select() {
              return this;
            },
            order() {
              return Promise.resolve({
                data: [
                  {
                    id: 'flag-1',
                    agency_account_id: 'acct-1',
                    agency_client_id: null,
                    flag_key: 'payment_required',
                    enabled: false,
                    config: null,
                    metadata: null,
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                  },
                ],
                error: null,
              });
            },
          };
        }

        if (table === 'agency_model_policies') {
          return {
            select() {
              return this;
            },
            order() {
              return Promise.resolve({
                data: [
                  {
                    id: 'policy-1',
                    agency_account_id: 'acct-1',
                    agency_client_id: null,
                    product_surface: 'deep_audit',
                    provider_name: 'openai',
                    model_id: 'gpt-5.5',
                    is_active: true,
                    metadata: null,
                    created_at: '2026-04-01T00:00:00.000Z',
                    updated_at: '2026-04-01T00:00:00.000Z',
                  },
                ],
                error: null,
              });
            },
          };
        }

        if (table === 'users') {
          return {
            select() {
              return this;
            },
            in() {
              return Promise.resolve({
                data: [{ id: 'user-1', email: 'pilot@lifter.ca' }],
                error: null,
              });
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    } as any;

    const rows = await createAgencyAdminData(supabase).getAccounts();

    expect(rows).toEqual([
      {
        id: 'acct-1',
        account_key: 'lifter',
        name: 'Lifter',
        website_domain: 'lifter.ca',
        canonical_domain: 'lifter.ca',
        status: 'pilot',
        billing_mode: 'pilot_exempt',
        benchmark_vertical: 'healthcare',
        benchmark_subvertical: 'medical_clinics',
        metadata: {},
        created_at: '2026-04-01T00:00:00.000Z',
        updated_at: '2026-04-01T00:00:00.000Z',
        clients: [
          {
            id: 'client-1',
            agency_account_id: 'acct-1',
            client_key: 'lifter-self',
            name: 'Lifter',
            display_name: 'Lifter',
            website_domain: 'lifter.ca',
            canonical_domain: 'lifter.ca',
            status: 'active',
            vertical: 'healthcare',
            subvertical: 'medical_clinics',
            icp_tag: 'medical_clinics',
            metadata: {},
            created_at: '2026-04-01T00:00:00.000Z',
            updated_at: '2026-04-01T00:00:00.000Z',
          },
        ],
        users: [
          {
            id: 'membership-1',
            agency_account_id: 'acct-1',
            user_id: 'user-1',
            role: 'owner',
            status: 'active',
            metadata: {},
            created_at: '2026-04-01T00:00:00.000Z',
            updated_at: '2026-04-01T00:00:00.000Z',
            email: 'pilot@lifter.ca',
          },
        ],
        featureFlags: [
          {
            id: 'flag-1',
            agency_account_id: 'acct-1',
            agency_client_id: null,
            flag_key: 'payment_required',
            enabled: false,
            config: {},
            metadata: {},
            created_at: '2026-04-01T00:00:00.000Z',
            updated_at: '2026-04-01T00:00:00.000Z',
          },
        ],
        modelPolicies: [
          {
            id: 'policy-1',
            agency_account_id: 'acct-1',
            agency_client_id: null,
            product_surface: 'deep_audit',
            provider_name: 'openai',
            model_id: 'gpt-5.5',
            is_active: true,
            metadata: {},
            created_at: '2026-04-01T00:00:00.000Z',
            updated_at: '2026-04-01T00:00:00.000Z',
          },
        ],
      },
    ]);
  });
});
