import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { resolveOrganizationWebsite } from './organization-resolver';

describe('organization website resolver', () => {
  it('uses the SSRF-gated fetch result before deterministic extraction', async () => {
    const fetchPageImpl = vi.fn(async (url: string) => url.endsWith('/contact/') ? ({
      ok: true as const,
      html: '<html lang="en-CA"><body>Clinic 955 Main Street, Montreal, QC H9R 5K3 <a href="mailto:care@clinic.example.com">Email</a><a href="tel:+15145550100">Call</a></body></html>',
      finalUrl: 'https://clinic.example.com/contact/', redirectChain: ['https://clinic.example.com/contact/'], headers: {},
    }) : ({
      ok: true as const,
      html: `<html lang="en-CA"><head><title>Clinic</title><link rel="canonical" href="https://clinic.example.com/"><script type="application/ld+json">${JSON.stringify({
        '@type': 'MedicalClinic', name: 'Clinic', additionalType: 'private medical clinic', serviceType: ['Travel medicine'], inLanguage: ['en', 'fr'],
      })}</script></head><body><a href="/contact/">Contact</a>Travel medicine clinic</body></html>`,
      finalUrl: 'https://clinic.example.com/', redirectChain: ['https://clinic.example.ca/', 'https://clinic.example.com/'], headers: {},
    }));
    const result = await resolveOrganizationWebsite({
      url: 'https://clinic.example.ca/', approvedAliasHosts: ['clinic.example.ca'], observedAt: '2026-08-02T05:00:00.000Z', fetchPageImpl,
    });
    expect(fetchPageImpl).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ ok: true, resolution: { status: 'proposed', identity: { canonicalDomain: 'clinic.example.com' } } });
    if (result.ok) {
      expect(result.resolution.organization).toMatchObject({ publicEmail: 'care@clinic.example.com', publicTelephone: '+15145550100' });
      expect(result.resolution.markets[0]).toMatchObject({ countryCode: 'CA', subdivisionCode: 'CA-QC', locality: 'Montreal' });
      expect(result.resolution.evidence).toContainEqual(expect.objectContaining({ sourceUrl: 'https://clinic.example.com/contact/' }));
    }
  });

  it('returns a stable fetch failure without attempting enrichment or storage', async () => {
    const result = await resolveOrganizationWebsite({
      url: 'https://169.254.169.254/',
      fetchPageImpl: vi.fn(async () => ({ ok: false as const, reason: 'Internal or private addresses are not allowed' })),
    });
    expect(result).toEqual({ ok: false, reason: 'exact_site_fetch_failed:Internal or private addresses are not allowed' });
  });
});
