import { describe, expect, it } from 'vitest';
import {
  assembleDigestStats,
  buildEngagementDigestHtml,
  digestHasActivity,
  digestSubject,
  type DigestStats,
} from './engagement-digest';

const EMPTY: DigestStats = {
  providerAccepted: [],
  pixelLoads: [],
  possibleReportVisits: 0,
  verifiedAuditRequests: [],
  newLeads: [],
};

describe('digestHasActivity', () => {
  it('is false when nothing happened and true for any single signal', () => {
    expect(digestHasActivity(EMPTY)).toBe(false);
    expect(digestHasActivity({ ...EMPTY, possibleReportVisits: 1 })).toBe(true);
    expect(digestHasActivity({ ...EMPTY, verifiedAuditRequests: [{ domain: 'a.ca' }] })).toBe(true);
    expect(digestHasActivity({ ...EMPTY, newLeads: [{ email: 'a@b.ca', url: 'https://b.ca' }] })).toBe(true);
  });

  it('does not send an engagement alert for outbound provider acceptance alone', () => {
    expect(digestHasActivity({ ...EMPTY, providerAccepted: [{ company: 'A', score: 70 }] })).toBe(false);
  });
});

describe('assembleDigestStats', () => {
  it('does not turn campaign previews, founder QA, or duplicate serves into buyer actions', () => {
    const internalBatch = [
      'hoopdesk.com', 'canadadirect.ca', 'delvinia.com', 'estateably.com',
      'altavia.co', 'webtmize.com', 'therundigital.com', 'sdpn.ca',
    ].map((domain) => ({
      guest_email: null,
      user_id: null,
      scan: { domain, run_source: 'admin_manual' },
    }));
    const stats = assembleDigestStats({
      sends: [{ score: 69, prospect: { company: 'Hill & Foster' } }],
      pixelLoads: [{ prospect: { company: 'Big Fox' } }],
      reportViews: [
        { data: { scanId: 'big-fox-scan' } },
        { data: { scanId: 'big-fox-scan' } },
      ],
      audits: [
        ...internalBatch,
        {
          guest_email: 'uzzielt@techehealthservices.com',
          user_id: null,
          scan: { domain: 'jnmanagedservices.com', run_source: 'public_self_serve' },
        },
        {
          guest_email: 'owner@realbuyer.ca',
          user_id: null,
          scan: { domain: 'realbuyer.ca', run_source: 'public_self_serve' },
        },
      ],
      users: [],
      prospects: [],
      leads: [],
    });

    expect(stats.verifiedAuditRequests).toEqual([{ domain: 'realbuyer.ca' }]);
    expect(stats.possibleReportVisits).toBe(1);
    expect(stats.pixelLoads).toEqual([{ company: 'Big Fox' }]);
    expect(stats.providerAccepted).toEqual([{ company: 'Hill & Foster', score: 69 }]);
  });
});

describe('digestSubject', () => {
  it('leads with the hottest signals', () => {
    expect(
      digestSubject({
        providerAccepted: [{ company: 'Kezber', score: 66 }],
        pixelLoads: [{ company: 'Kezber' }],
        possibleReportVisits: 2,
        verifiedAuditRequests: [{ domain: 'kezber.com' }],
        newLeads: [],
      })
    ).toBe('GEO-Pulse engagement: 1 verified audit request · 2 possible report visits · 1 tracking-image load');
  });

  it('does not promote provider acceptance into an engagement subject', () => {
    expect(digestSubject({ ...EMPTY, providerAccepted: [{ company: 'A', score: null }] })).toBe(
      'GEO-Pulse engagement: '
    );
  });
});

describe('buildEngagementDigestHtml', () => {
  it('escapes untrusted names and renders each populated section', () => {
    const html = buildEngagementDigestHtml({
      providerAccepted: [{ company: '<script>alert(1)</script>', score: 70 }],
      pixelLoads: [{ company: 'Groupe SL' }],
      possibleReportVisits: 3,
      verifiedAuditRequests: [{ domain: 'resitek.com' }],
      newLeads: [{ email: 'owner@shop.ca', url: 'https://shop.ca/' }],
    });
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('resitek.com');
    expect(html).toContain('Groupe SL');
    expect(html).toContain('owner@shop.ca');
    expect(html).toContain('Engagement digest');
  });

  it('omits empty sections entirely', () => {
    const html = buildEngagementDigestHtml({ ...EMPTY, possibleReportVisits: 1 });
    expect(html).not.toContain('accepted by the email provider');
    expect(html).not.toContain('New leads captured');
    expect(html).toContain('Possible report visits');
  });
});
