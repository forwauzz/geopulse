import { describe, expect, it } from 'vitest';
import { getAgencyDashboardData } from './agency-dashboard-data';

describe('getAgencyDashboardData', () => {
  it('hydrates selected agency context with client-scoped history', async () => {
    const supabase = {
      from(table: string) {
        if (table === 'agency_users') {
          let eqCalls = 0;
          return {
            select() {
              return this;
            },
            eq(_field: string, _value: string) {
              eqCalls += 1;
              if (eqCalls < 2) {
                return this;
              }
              return Promise.resolve({
                data: [{ agency_account_id: 'acct-1', status: 'active' }],
                error: null,
              });
            },
          };
        }

        if (table === 'agency_accounts') {
          return {
            select() {
              return this;
            },
            in() {
              return this;
            },
            order() {
              return Promise.resolve({
                data: [
                  {
                    id: 'acct-1',
                    account_key: 'lifter',
                    name: 'Lifter',
                    benchmark_vertical: 'healthcare',
                    benchmark_subvertical: 'medical_clinics',
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
            in() {
              return this;
            },
            eq() {
              return this;
            },
            order() {
              return Promise.resolve({
                data: [
                  {
                    id: 'client-1',
                    agency_account_id: 'acct-1',
                    client_key: 'clinic-a',
                    name: 'Clinic A',
                    canonical_domain: 'clinica.com',
                    vertical: 'healthcare',
                    subvertical: 'medical_clinics',
                    icp_tag: 'medical_clinics',
                  },
                ],
                error: null,
              });
            },
          };
        }

        if (table === 'scans') {
          return {
            select() {
              return this;
            },
            in() {
              return this;
            },
            order() {
              return this;
            },
            eq(_field: string, _value: string) {
              return Promise.resolve({
                data: [
                  {
                    id: 'scan-1',
                    agency_account_id: 'acct-1',
                    agency_client_id: 'client-1',
                    url: 'https://clinica.com',
                    domain: 'clinica.com',
                    score: 82,
                    letter_grade: 'B',
                    created_at: '2026-04-01T00:00:00.000Z',
                    run_source: 'agency_dashboard',
                  },
                ],
                error: null,
              });
            },
          };
        }

        if (table === 'reports') {
          return {
            select() {
              return this;
            },
            in() {
              return this;
            },
            order() {
              return this;
            },
            eq(_field: string, _value: string) {
              return Promise.resolve({
                data: [
                  {
                    id: 'report-1',
                    scan_id: 'scan-1',
                    agency_account_id: 'acct-1',
                    agency_client_id: 'client-1',
                    type: 'deep_audit',
                    email_delivered_at: '2026-04-01T01:00:00.000Z',
                    pdf_generated_at: '2026-04-01T00:30:00.000Z',
                    pdf_url: 'https://example.com/report.pdf',
                  },
                ],
                error: null,
              });
            },
          };
        }

        if (table === 'agency_feature_flags') {
          let filters: Record<string, unknown> = {};
          return {
            select() {
              return this;
            },
            eq(field: string, value: unknown) {
              filters[field] = value;
              return this;
            },
            is(field: string, value: unknown) {
              filters[field] = value;
              return this;
            },
            maybeSingle() {
              if (
                filters['agency_client_id'] === 'client-1' &&
                filters['flag_key'] === 'geo_tracker_enabled'
              ) {
                return Promise.resolve({ data: { enabled: true }, error: null });
              }
              return Promise.resolve({ data: null, error: null });
            },
          };
        }

        if (table === 'agency_client_domains') {
          return {
            select() {
              return this;
            },
            in() {
              return this;
            },
            order() {
              return this;
            },
            then: undefined,
            catch: undefined,
            finally: undefined,
            [Symbol.toStringTag]: 'Promise',
            async *[Symbol.asyncIterator]() {},
          } as any;
        }

        throw new Error(`Unexpected table ${table}`);
      },
    } as any;

    const data = await getAgencyDashboardData({
      supabase,
      userId: 'user-1',
      selectedAccountId: 'acct-1',
      selectedClientId: 'client-1',
    });

    expect(data.selectedAccountId).toBe('acct-1');
    expect(data.selectedClientId).toBe('client-1');
    expect(data.accounts).toHaveLength(1);
    expect(data.accounts[0]?.clients[0]?.name).toBe('Clinic A');
    expect(data.scans[0]?.runSource).toBe('agency_dashboard');
    expect(data.reports[0]?.scanId).toBe('scan-1');
    expect(data.entitlements.geoTrackerEnabled).toBe(true);
    expect(data.entitlements.deepAuditEnabled).toBe(true);
    expect(data.selectedClientDomains).toEqual([]);
  });
});
