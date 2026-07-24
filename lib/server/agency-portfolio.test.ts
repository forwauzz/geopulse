import { describe, expect, it } from 'vitest';

describe('agency portfolio contract', () => {
  it('keeps report states explicit for the agency UI', async () => {
    const { loadAgencyPortfolio } = await import('./agency-portfolio');
    const data = {
      accounts: [],
      selectedAccountId: 'a1',
      selectedClientId: null,
      selectedClientDomains: [],
      scans: [],
      reports: [],
      entitlements: {} as never,
    };
    const rows = await loadAgencyPortfolio({
      supabase: { from: () => { throw new Error('no query expected'); } },
      data,
      account: {
        id: 'a1',
        accountKey: 'agency',
        name: 'Agency',
        benchmarkVertical: null,
        benchmarkSubvertical: null,
        clients: [{
          id: 'c1',
          agencyAccountId: 'a1',
          clientKey: 'client',
          name: 'Client',
          canonicalDomain: null,
          vertical: null,
          subvertical: null,
          icpTag: null,
        }],
      },
    });
    expect(rows[0]).toMatchObject({
      clientName: 'Client',
      reportStatus: 'not_started',
      nextAction: 'Add the client website',
    });
  });
});
