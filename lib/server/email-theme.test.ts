import { describe, expect, it } from 'vitest';
import { agentEmailSignatureHtml, emailShell } from './email-theme';

describe('Mole employee email signatures', () => {
  it('renders the accountable employee name, role, and public portrait', () => {
    const html = agentEmailSignatureHtml('maya');

    expect(html).toContain('Maya Brooks');
    expect(html).toContain('AI Chief of Staff');
    expect(html).toContain('https://getgeopulse.com/team/maya-brooks.webp');
  });

  it('makes an employee signature part of the shared email shell', () => {
    const html = emailShell({
      kicker: 'Test update',
      bodyHtml: '<p>Done.</p>',
      sender: 'priya',
    });

    expect(html).toContain('Priya Shah');
    expect(html).toContain('SEO &amp; Customer Outcomes Strategist');
    expect(html).toContain('https://getgeopulse.com/team/priya-shah.webp');
  });

  it('uses hosted, accessible Instagram and LinkedIn logo images', () => {
    const html = agentEmailSignatureHtml('elena');

    expect(html).toContain('src="https://getgeopulse.com/branding/email/instagram.png"');
    expect(html).toContain('alt="Instagram"');
    expect(html).toContain('src="https://getgeopulse.com/branding/email/linkedin.png"');
    expect(html).toContain('alt="LinkedIn"');
  });
});
