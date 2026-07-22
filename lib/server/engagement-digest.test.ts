import { describe, expect, it } from 'vitest';
import {
  buildEngagementDigestHtml,
  digestHasActivity,
  digestSubject,
  type DigestStats,
} from './engagement-digest';

const EMPTY: DigestStats = { sends: [], opens: [], views: 0, fullAudits: [], newLeads: [] };

describe('digestHasActivity', () => {
  it('is false when nothing happened and true for any single signal', () => {
    expect(digestHasActivity(EMPTY)).toBe(false);
    expect(digestHasActivity({ ...EMPTY, views: 1 })).toBe(true);
    expect(digestHasActivity({ ...EMPTY, fullAudits: [{ domain: 'a.ca' }] })).toBe(true);
    expect(digestHasActivity({ ...EMPTY, newLeads: [{ email: 'a@b.ca', url: 'https://b.ca' }] })).toBe(true);
  });
});

describe('digestSubject', () => {
  it('leads with the hottest signals', () => {
    expect(
      digestSubject({
        sends: [{ company: 'Kezber', score: 66 }],
        opens: [{ company: 'Kezber' }],
        views: 2,
        fullAudits: [{ domain: 'kezber.com' }],
        newLeads: [],
      })
    ).toBe('GEO-Pulse engagement: 1 full audit · 2 report views · 1 open');
  });

  it('falls back to delivered sends when nothing else moved', () => {
    expect(digestSubject({ ...EMPTY, sends: [{ company: 'A', score: null }] })).toBe(
      'GEO-Pulse engagement: 1 sends delivered'
    );
  });
});

describe('buildEngagementDigestHtml', () => {
  it('escapes untrusted names and renders each populated section', () => {
    const html = buildEngagementDigestHtml({
      sends: [{ company: '<script>alert(1)</script>', score: 70 }],
      opens: [{ company: 'Groupe SL' }],
      views: 3,
      fullAudits: [{ domain: 'resitek.com' }],
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
    const html = buildEngagementDigestHtml({ ...EMPTY, views: 1 });
    expect(html).not.toContain('Scorecards delivered');
    expect(html).not.toContain('New leads captured');
    expect(html).toContain('Report views');
  });
});
