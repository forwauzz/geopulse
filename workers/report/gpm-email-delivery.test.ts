import { describe, it, expect, vi, beforeEach } from 'vitest';

// We test the HTML builder by importing the module and calling sendGpmReportEmail
// with a mocked fetch; the email function is the public surface.

import type { GpmReportPayload } from '@/lib/server/geo-performance-report-payload';

// ── Minimal fixture ───────────────────────────────────────────────────────────

function makePayload(overrides: Partial<GpmReportPayload> = {}): GpmReportPayload {
  return {
    configId: 'cfg-1',
    domain: 'elitephysio.ca',
    topic: 'Vestibular Rehabilitation',
    location: 'Vancouver',
    windowDate: '2026-04',
    platform: 'chatgpt',
    modelId: 'gpt-4o',
    reportedAt: '2026-04-23T00:00:00Z',
    citationRate: 0.6,
    shareOfVoice: 0.4,
    queryCoverage: 1,
    visibilityPct: 0.6,
    industryRank: 1.5,
    prompts: [
      { queryKey: 'q1', queryText: 'best vestibular clinic Vancouver', cited: true,  rankPosition: 1,    topCompetitorInQuery: null },
      { queryKey: 'q2', queryText: 'vertigo treatment Vancouver',      cited: true,  rankPosition: 2,    topCompetitorInQuery: null },
      { queryKey: 'q3', queryText: 'dizziness specialist near me',     cited: false, rankPosition: null, topCompetitorInQuery: 'physio.ca' },
      { queryKey: 'q4', queryText: 'balance disorder therapy',         cited: false, rankPosition: null, topCompetitorInQuery: null },
      { queryKey: 'q5', queryText: 'BPPV treatment near me',           cited: true,  rankPosition: 1,    topCompetitorInQuery: null },
    ],
    competitors: [
      { name: 'physio.ca',         citationCount: 3, totalQueries: 5 },
      { name: 'BalanceCenter.com', citationCount: 1, totalQueries: 5 },
    ],
    opportunities: [
      { queryKey: 'q3', queryText: 'dizziness specialist near me', topCompetitorInQuery: 'physio.ca' },
      { queryKey: 'q4', queryText: 'balance disorder therapy',     topCompetitorInQuery: null },
    ],
    ...overrides,
  };
}

// ── Helpers to inspect HTML ───────────────────────────────────────────────────

async function capturedHtml(payload: GpmReportPayload, extraInput: Record<string, unknown> = {}): Promise<string> {
  let capturedBody = '';
  vi.stubGlobal('fetch', async (_url: unknown, init: { body: string }) => {
    capturedBody = init.body;
    return { ok: true, text: async () => '{"id":"test-id"}' };
  });

  const { sendGpmReportEmail } = await import('./gpm-email-delivery');
  await sendGpmReportEmail({
    apiKey: 'test-key',
    from: 'reports@geopulse.io',
    to: 'client@example.com',
    payload,
    idempotencyKey: 'test-idem',
    ...extraInput,
  });

  vi.unstubAllGlobals();
  const parsed = JSON.parse(capturedBody) as { html: string };
  return parsed.html;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('gpm-email-delivery', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
  });

  // Subject line
  it('builds correct subject line', async () => {
    let capturedBody = '';
    vi.stubGlobal('fetch', async (_url: unknown, init: { body: string }) => {
      capturedBody = init.body;
      return { ok: true, text: async () => '' };
    });

    const { sendGpmReportEmail } = await import('./gpm-email-delivery');
    await sendGpmReportEmail({
      apiKey: 'k',
      from: 'a@b.com',
      to: 'c@d.com',
      payload: makePayload(),
      idempotencyKey: 'x',
    });
    vi.unstubAllGlobals();

    const { subject } = JSON.parse(capturedBody) as { subject: string };
    expect(subject).toBe('GEO Performance Report — elitephysio.ca · Vestibular Rehabilitation, Vancouver · April 2026');
  });

  it('formats weekly window date', async () => {
    let capturedBody = '';
    vi.stubGlobal('fetch', async (_url: unknown, init: { body: string }) => {
      capturedBody = init.body;
      return { ok: true, text: async () => '' };
    });

    const { sendGpmReportEmail } = await import('./gpm-email-delivery');
    await sendGpmReportEmail({
      apiKey: 'k', from: 'a@b.com', to: 'c@d.com',
      payload: makePayload({ windowDate: '2026-W07' }),
      idempotencyKey: 'x',
    });
    vi.unstubAllGlobals();

    const { subject } = JSON.parse(capturedBody) as { subject: string };
    expect(subject).toContain('Week 7, 2026');
  });

  // HTML structure
  it('includes domain in HTML', async () => {
    const html = await capturedHtml(makePayload());
    expect(html).toContain('elitephysio.ca');
  });

  it('includes platform label ChatGPT', async () => {
    const html = await capturedHtml(makePayload({ platform: 'chatgpt' }));
    expect(html).toContain('ChatGPT');
  });

  it('includes platform label Gemini', async () => {
    const html = await capturedHtml(makePayload({ platform: 'gemini' }));
    expect(html).toContain('Gemini');
  });

  it('includes platform label Perplexity', async () => {
    const html = await capturedHtml(makePayload({ platform: 'perplexity' }));
    expect(html).toContain('Perplexity');
  });

  it('shows visibility percentage', async () => {
    const html = await capturedHtml(makePayload({ visibilityPct: 0.6 }));
    expect(html).toContain('60%');
  });

  it('shows citation rate', async () => {
    const html = await capturedHtml(makePayload({ citationRate: 0.6 }));
    // 60% for citationRate as well
    expect(html).toContain('60%');
  });

  it('shows industry rank', async () => {
    const html = await capturedHtml(makePayload({ industryRank: 1.5 }));
    expect(html).toContain('#1.5');
  });

  it('shows em-dash when industryRank is null', async () => {
    const html = await capturedHtml(makePayload({ industryRank: null }));
    expect(html).toContain('\u2014');
  });

  it('shows cited count out of total', async () => {
    const html = await capturedHtml(makePayload());
    expect(html).toContain('3 of 5 queries');
  });

  it('renders opportunities section', async () => {
    const html = await capturedHtml(makePayload());
    expect(html).toContain('Top opportunities');
    expect(html).toContain('dizziness specialist near me');
  });

  it('shows competitor in opportunity', async () => {
    const html = await capturedHtml(makePayload());
    expect(html).toContain('appeared instead: physio.ca');
  });

  it('renders competitors section', async () => {
    const html = await capturedHtml(makePayload());
    expect(html).toContain('Competitor co-citations');
    expect(html).toContain('physio.ca');
  });

  it('omits opportunities section when empty', async () => {
    const html = await capturedHtml(makePayload({ opportunities: [] }));
    expect(html).not.toContain('Top opportunities');
  });

  it('omits competitors section when empty', async () => {
    const html = await capturedHtml(makePayload({ competitors: [] }));
    expect(html).not.toContain('Competitor co-citations');
  });

  it('includes narrative when provided', async () => {
    const html = await capturedHtml(makePayload(), { narrative: 'This is the narrative text.' });
    expect(html).toContain('This is the narrative text.');
  });

  it('omits narrative block when not provided', async () => {
    const html = await capturedHtml(makePayload());
    expect(html).not.toContain('narrative text');
  });

  it('includes PDF URL button when pdfUrl is set', async () => {
    const html = await capturedHtml(makePayload(), { pdfUrl: 'https://cdn.example.com/report.pdf' });
    expect(html).toContain('Download Full Report PDF');
    expect(html).toContain('https://cdn.example.com/report.pdf');
  });

  it('shows attached note when pdfBytes passed without pdfUrl', async () => {
    const html = await capturedHtml(makePayload(), {
      pdfBytes: new Uint8Array([1, 2, 3]),
      pdfUrl: null,
    });
    expect(html).toContain('attached to this email');
  });

  it('escapes HTML in domain', async () => {
    const html = await capturedHtml(makePayload({ domain: '<script>alert(1)</script>.ca' }));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes HTML in opportunity query text', async () => {
    const html = await capturedHtml(makePayload({
      opportunities: [
        { queryKey: 'q1', queryText: '<b>bold</b> query', topCompetitorInQuery: null },
      ],
    }));
    expect(html).not.toMatch(/<b>bold<\/b>/);
    expect(html).toContain('&lt;b&gt;bold&lt;/b&gt;');
  });

  // Resend API call
  it('posts to resend API with idempotency key', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    vi.stubGlobal('fetch', async (url: string, init: { headers: Record<string, string>; body: string }) => {
      capturedUrl = url;
      capturedHeaders = init.headers;
      return { ok: true, text: async () => '' };
    });

    const { sendGpmReportEmail } = await import('./gpm-email-delivery');
    await sendGpmReportEmail({
      apiKey: 're_key_123',
      from: 'a@b.com',
      to: 'c@d.com',
      payload: makePayload(),
      idempotencyKey: 'idem-abc',
    });
    vi.unstubAllGlobals();

    expect(capturedUrl).toBe('https://api.resend.com/emails');
    expect(capturedHeaders['Authorization']).toBe('Bearer re_key_123');
    expect(capturedHeaders['Idempotency-Key']).toBe('idem-abc');
  });

  it('returns ok:true on 200 response', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: true, text: async () => '' }));
    const { sendGpmReportEmail } = await import('./gpm-email-delivery');
    const result = await sendGpmReportEmail({
      apiKey: 'k', from: 'a@b.com', to: 'c@d.com',
      payload: makePayload(), idempotencyKey: 'x',
    });
    vi.unstubAllGlobals();
    expect(result.ok).toBe(true);
  });

  it('returns ok:false with message on non-200 response', async () => {
    vi.stubGlobal('fetch', async () => ({ ok: false, text: async () => 'rate_limit_exceeded' }));
    const { sendGpmReportEmail } = await import('./gpm-email-delivery');
    const result = await sendGpmReportEmail({
      apiKey: 'k', from: 'a@b.com', to: 'c@d.com',
      payload: makePayload(), idempotencyKey: 'x',
    });
    vi.unstubAllGlobals();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain('rate_limit_exceeded');
  });

  it('attaches PDF as base64 when pdfBytes provided and no pdfUrl', async () => {
    let capturedBody = '';
    vi.stubGlobal('fetch', async (_url: unknown, init: { body: string }) => {
      capturedBody = init.body;
      return { ok: true, text: async () => '' };
    });

    const { sendGpmReportEmail } = await import('./gpm-email-delivery');
    await sendGpmReportEmail({
      apiKey: 'k', from: 'a@b.com', to: 'c@d.com',
      payload: makePayload(),
      pdfBytes: new Uint8Array([80, 68, 70]),
      idempotencyKey: 'x',
    });
    vi.unstubAllGlobals();

    const parsed = JSON.parse(capturedBody) as { attachments?: Array<{ filename: string; content: string }> };
    expect(parsed.attachments).toBeDefined();
    expect(parsed.attachments![0]!.filename).toMatch(/\.pdf$/);
    expect(parsed.attachments![0]!.content).toBeTruthy();
  });

  it('does NOT attach PDF when pdfUrl is set', async () => {
    let capturedBody = '';
    vi.stubGlobal('fetch', async (_url: unknown, init: { body: string }) => {
      capturedBody = init.body;
      return { ok: true, text: async () => '' };
    });

    const { sendGpmReportEmail } = await import('./gpm-email-delivery');
    await sendGpmReportEmail({
      apiKey: 'k', from: 'a@b.com', to: 'c@d.com',
      payload: makePayload(),
      pdfBytes: new Uint8Array([80, 68, 70]),
      pdfUrl: 'https://cdn.example.com/report.pdf',
      idempotencyKey: 'x',
    });
    vi.unstubAllGlobals();

    const parsed = JSON.parse(capturedBody) as { attachments?: unknown[] };
    expect(parsed.attachments).toBeUndefined();
  });
});
