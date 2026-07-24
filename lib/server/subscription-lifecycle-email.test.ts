import { describe, expect, it } from 'vitest';
import { buildSubscriptionWelcomeEmail, buildTrialEndingEmail } from './subscription-lifecycle-email';

describe('subscription lifecycle email', () => {
  it('gives an agency a short, actionable onboarding path', () => {
    const email = buildSubscriptionWelcomeEmail({
      appUrl: 'https://getgeopulse.com/',
      bundleKey: 'agency_core',
      organizationName: 'Northstar',
    });
    expect(email.subject).toContain('Agency Core');
    expect(email.html).toContain('add one client');
    expect(email.html).toContain('ChatGPT, Gemini, and Perplexity');
    expect(email.html).toContain('https://getgeopulse.com/dashboard');
  });

  it('routes trial reminders to self-service billing', () => {
    const email = buildTrialEndingEmail({
      appUrl: 'https://getgeopulse.com',
      bundleKey: 'agency_pro',
    });
    expect(email.html).toContain('/dashboard/billing');
    expect(email.html).toContain('cancel');
  });
});
