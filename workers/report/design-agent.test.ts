import { describe, expect, it } from 'vitest';
import { buildCoverDesignCopy, captureHeroScreenshot, extractSiteIdentity, isDesignAgentEnabled } from './design-agent';
import { AGENT_REGISTRY_VERSION } from '../scan-engine/agent-registry';
import { buildDeepAuditPdf } from './build-deep-audit-pdf';

type FakeRow = { enabled?: boolean; kill_switch?: boolean } | null;

function fakeSupabase(row: FakeRow, fail = false) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            if (fail) return { data: null, error: { message: 'relation does not exist' } };
            return { data: row, error: null };
          },
        }),
      }),
    }),
  } as never;
}

describe('isDesignAgentEnabled (fail-OPEN kill switch)', () => {
  it('defaults ON with no row and ON when the table is missing', async () => {
    expect(await isDesignAgentEnabled(fakeSupabase(null))).toBe(true);
    expect(await isDesignAgentEnabled(fakeSupabase(null, true))).toBe(true);
  });

  it('honors the admin switch-off and kill switch', async () => {
    expect(await isDesignAgentEnabled(fakeSupabase({ enabled: false }))).toBe(false);
    expect(await isDesignAgentEnabled(fakeSupabase({ enabled: true, kill_switch: true }))).toBe(false);
    expect(await isDesignAgentEnabled(fakeSupabase({ enabled: true, kill_switch: false }))).toBe(true);
  });
});

describe('buildCoverDesignCopy', () => {
  const copy = buildCoverDesignCopy({ domain: 'acme-it.example', checkCount: 24, generatedDate: '2026-07-21' });

  it('personalizes the prepared-for line', () => {
    expect(copy.preparedForLines[0]).toBe('Prepared for the team at acme-it.example');
  });

  it('carries GEO-Pulse provenance with the Montréal line', () => {
    expect(copy.preparedByLines).toContain('Prepared by the GEO-Pulse team');
    expect(copy.preparedByLines.join(' ')).toContain('Montréal, Québec');
    expect(copy.preparedByLines.join(' ')).toContain('getgeopulse.com');
  });

  it('states only verifiable credibility facts, including the registry date', () => {
    expect(copy.credibilityLines.join(' ')).toContain('24 checks');
    expect(copy.credibilityLines.join(' ')).toContain(AGENT_REGISTRY_VERSION);
    expect(copy.credibilityLines.join(' ')).toContain('methodology');
  });
});

describe('captureHeroScreenshot', () => {
  it('returns null when Browser Rendering is not configured', async () => {
    expect(await captureHeroScreenshot({}, 'https://example.com/')).toBeNull();
  });

  it('returns null on a non-image or failed response, bytes on success', async () => {
    const env = {
      DEEP_AUDIT_BROWSER_RENDER_MODE: 'auto',
      CLOUDFLARE_ACCOUNT_ID: 'acct',
      BROWSER_RENDERING_API_TOKEN: 'tok',
    };
    const bad = await captureHeroScreenshot(env, 'https://example.com/', {
      fetchImpl: (async () => new Response('{"success":false}', { status: 500 })) as typeof fetch,
    });
    expect(bad).toBeNull();

    const notImage = await captureHeroScreenshot(env, 'https://example.com/', {
      fetchImpl: (async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch,
    });
    expect(notImage).toBeNull();

    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const good = await captureHeroScreenshot(env, 'https://example.com/', {
      fetchImpl: (async () => new Response(png, { status: 200, headers: { 'Content-Type': 'image/png' } })) as typeof fetch,
    });
    expect(good).toEqual(png);
  });

  it('refuses SSRF-invalid URLs before any fetch happens', async () => {
    const env = {
      DEEP_AUDIT_BROWSER_RENDER_MODE: 'auto',
      CLOUDFLARE_ACCOUNT_ID: 'acct',
      BROWSER_RENDERING_API_TOKEN: 'tok',
    };
    const out = await captureHeroScreenshot(env, 'http://169.254.169.254/latest/meta-data', {
      fetchImpl: (async () => {
        throw new Error('fetch must not be called for invalid URLs');
      }) as typeof fetch,
    });
    expect(out).toBeNull();
  });
});

describe('extractSiteIdentity (issue #103 — client theming)', () => {
  it('reads theme-color and og:site_name', () => {
    const id = extractSiteIdentity(
      '<head><meta name="theme-color" content="#1a2b3c"><meta property="og:site_name" content="Acme IT"></head>'
    );
    expect(id.themeColor).toBe('#1a2b3c');
    expect(id.siteName).toBe('Acme IT');
  });

  it('falls back to the title before the separator, and normalizes short hex', () => {
    const id = extractSiteIdentity('<head><meta name="theme-color" content="#abc"><title>Acme IT — Managed Services | Montréal</title></head>');
    expect(id.themeColor).toBe('#aabbcc');
    expect(id.siteName).toBe('Acme IT');
  });

  it('returns nulls on pages without identity signals', () => {
    const id = extractSiteIdentity('<html><body>hi</body></html>');
    expect(id.themeColor).toBeNull();
    expect(id.siteName).toBeNull();
  });
});

describe('buildCoverDesignCopy with a site name', () => {
  it('prefers "SiteName (domain)"', () => {
    const copy = buildCoverDesignCopy({ domain: 'acme.ca', checkCount: 24, generatedDate: 'x', siteName: 'Acme IT' });
    expect(copy.preparedForLines[0]).toBe('Prepared for the team at Acme IT (acme.ca)');
  });
});

describe('PDF cover with design (integration smoke)', () => {
  it('renders the personalized cover without a screenshot', async () => {
    const bytes = await buildDeepAuditPdf({
      url: 'https://example.com/',
      domain: 'example.com',
      score: 72,
      letterGrade: 'B',
      issuesJson: [{ check: 'Title', checkId: 'title-tag', passed: true, status: 'PASS', finding: 'ok' }],
      coverDesign: {
        ...buildCoverDesignCopy({ domain: 'example.com', checkCount: 24, generatedDate: '2026-07-21' }),
        themePrimaryHex: null,
        heroImage: null,
      },
    });
    expect(String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!)).toBe('%PDF');
  });

  it('survives an invalid screenshot payload (embed fallback)', async () => {
    const bytes = await buildDeepAuditPdf({
      url: 'https://example.com/',
      domain: 'example.com',
      score: 72,
      letterGrade: 'B',
      issuesJson: [{ check: 'Title', checkId: 'title-tag', passed: true, status: 'PASS', finding: 'ok' }],
      coverDesign: {
        ...buildCoverDesignCopy({ domain: 'example.com', checkCount: 24, generatedDate: '2026-07-21' }),
        themePrimaryHex: null,
        heroImage: new Uint8Array([1, 2, 3, 4]), // not a real image
      },
    });
    expect(String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!)).toBe('%PDF');
  });
});
