import { describe, expect, it } from 'vitest';
import { buildRevenueNurtureEmail, buildSavedPreviewEmail } from './lead-email';

describe('lead email safeguards', () => {
  it('builds the promised transactional preview link without an unsubscribe fiction', () => {
    const email = buildSavedPreviewEmail({
      appUrl: 'https://getgeopulse.com/',
      scanId: 'bdf0b213-ca92-4184-a9fe-4d72cdc8c223',
      url: 'https://alie.app',
      score: 64,
    });
    expect(email.html).toContain(
      'https://getgeopulse.com/results/bdf0b213-ca92-4184-a9fe-4d72cdc8c223'
    );
    expect(email.html).toContain('64');
    expect(email.html).not.toContain('/api/outreach/unsubscribe/');
  });

  it('puts tracking and one-click unsubscribe into the opted-in nurture message', () => {
    const email = buildRevenueNurtureEmail({
      appUrl: 'https://getgeopulse.com',
      prospectId: '11111111-1111-4111-8111-111111111111',
      sendId: '22222222-2222-4222-8222-222222222222',
      scanId: '33333333-3333-4333-8333-333333333333',
      url: 'https://alie.app',
      score: 64,
    });
    expect(email.html).toContain(
      '/api/outreach/unsubscribe/11111111-1111-4111-8111-111111111111'
    );
    expect(email.html).toContain('/api/outreach/open/22222222-2222-4222-8222-222222222222');
    expect(email.html).toContain('utm_campaign=monitoring');
    expect(email.html).not.toContain('guarantee');
  });
});
