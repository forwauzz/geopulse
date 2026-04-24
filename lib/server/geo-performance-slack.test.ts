import { describe, it, expect, vi, beforeEach } from 'vitest';
import { formatGpmSlackMessage, sendGpmReportSlackSummary } from './geo-performance-slack';
import type { GpmReportPayload } from './geo-performance-report-payload';

// ── Fixture ───────────────────────────────────────────────────────────────────

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
    industryRank: 2,
    prompts: [
      { queryKey: 'q1', queryText: 'best vestibular clinic', cited: true,  rankPosition: 1,    topCompetitorInQuery: null },
      { queryKey: 'q2', queryText: 'vertigo treatment',     cited: true,  rankPosition: 2,    topCompetitorInQuery: null },
      { queryKey: 'q3', queryText: 'dizziness specialist',  cited: false, rankPosition: null, topCompetitorInQuery: 'physio.ca' },
    ],
    competitors: [{ name: 'physio.ca', citationCount: 2, totalQueries: 3 }],
    opportunities: [
      { queryText: 'dizziness specialist', topCompetitorInQuery: 'physio.ca' },
    ],
    ...overrides,
  };
}

// ── formatGpmSlackMessage — pure unit tests ───────────────────────────────────

describe('formatGpmSlackMessage', () => {
  it('includes domain in header', () => {
    const text = formatGpmSlackMessage(makePayload(), null);
    expect(text).toContain('elitephysio.ca');
  });

  it('shows ChatGPT label', () => {
    const text = formatGpmSlackMessage(makePayload({ platform: 'chatgpt' }), null);
    expect(text).toContain('ChatGPT');
  });

  it('shows Gemini label', () => {
    const text = formatGpmSlackMessage(makePayload({ platform: 'gemini' }), null);
    expect(text).toContain('Gemini');
  });

  it('shows Perplexity label', () => {
    const text = formatGpmSlackMessage(makePayload({ platform: 'perplexity' }), null);
    expect(text).toContain('Perplexity');
  });

  it('formats monthly window date', () => {
    const text = formatGpmSlackMessage(makePayload({ windowDate: '2026-04' }), null);
    expect(text).toContain('April 2026');
  });

  it('formats weekly window date', () => {
    const text = formatGpmSlackMessage(makePayload({ windowDate: '2026-W07' }), null);
    expect(text).toContain('Week 7, 2026');
  });

  it('shows visibility as percent', () => {
    const text = formatGpmSlackMessage(makePayload({ visibilityPct: 0.6 }), null);
    expect(text).toContain('60%');
  });

  it('shows citation rate as percent with count', () => {
    const text = formatGpmSlackMessage(makePayload(), null);
    // citationRate=0.6 → 60%; 2 of 3 prompts are cited
    expect(text).toContain('60%');
    expect(text).toContain('2 of 3 queries');
  });

  it('shows industry rank with hash prefix', () => {
    const text = formatGpmSlackMessage(makePayload({ industryRank: 2 }), null);
    expect(text).toContain('#2');
  });

  it('shows em-dash when industryRank is null', () => {
    const text = formatGpmSlackMessage(makePayload({ industryRank: null }), null);
    expect(text).toContain('\u2014');
  });

  it('renders opportunities section', () => {
    const text = formatGpmSlackMessage(makePayload(), null);
    expect(text).toContain('Top opportunities');
    expect(text).toContain('dizziness specialist');
  });

  it('shows competitor in opportunity', () => {
    const text = formatGpmSlackMessage(makePayload(), null);
    expect(text).toContain('physio.ca appeared instead');
  });

  it('omits opportunities section when empty', () => {
    const text = formatGpmSlackMessage(makePayload({ opportunities: [] }), null);
    expect(text).not.toContain('Top opportunities');
  });

  it('caps opportunities at 3', () => {
    const payload = makePayload({
      opportunities: [
        { queryText: 'opp 1', topCompetitorInQuery: null },
        { queryText: 'opp 2', topCompetitorInQuery: null },
        { queryText: 'opp 3', topCompetitorInQuery: null },
        { queryText: 'opp 4', topCompetitorInQuery: null },
      ],
    });
    const text = formatGpmSlackMessage(payload, null);
    expect(text).toContain('opp 3');
    expect(text).not.toContain('opp 4');
  });

  it('includes PDF link when pdfUrl provided', () => {
    const text = formatGpmSlackMessage(makePayload(), 'https://cdn.example.com/report.pdf');
    expect(text).toContain('Download Full Report PDF');
    expect(text).toContain('https://cdn.example.com/report.pdf');
  });

  it('omits PDF link when pdfUrl is null', () => {
    const text = formatGpmSlackMessage(makePayload(), null);
    expect(text).not.toContain('Download Full Report PDF');
  });
});

// ── sendGpmReportSlackSummary ─────────────────────────────────────────────────

const DEST_ROW = {
  id: 'dest-1',
  startup_workspace_id: 'ws-1',
  installation_id: 'inst-1',
  channel_id: 'C123',
  channel_name: '#gpm-reports',
  status: 'active',
  is_default: true,
  metadata: {},
  created_at: '2026-01-01T00:00:00Z',
};

const INST_ROW = {
  id: 'inst-1',
  startup_workspace_id: 'ws-1',
  slack_team_id: 'T123',
  slack_team_name: 'Acme',
  status: 'active',
  metadata: { bot_access_token: 'xoxb-test-token' },
};

function makeFluentMock(rows: unknown[], single: unknown) {
  const self: any = {
    select: () => self,
    eq: () => self,
    order: () => self,
    maybeSingle: async () => ({ data: single, error: null }),
    data: rows,
    error: null,
  };
  return self;
}

function makeSupabaseMock(destRows: unknown[]) {
  return {
    from(table: string) {
      if (table === 'startup_slack_installations') {
        return makeFluentMock([INST_ROW], INST_ROW);
      }
      // startup_slack_destinations: list returns destRows; single returns DEST_ROW
      return makeFluentMock(destRows, destRows[0] ?? null);
    },
  };
}

describe('sendGpmReportSlackSummary', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends message to default active destination', async () => {
    let capturedBody = '';
    vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
      capturedBody = init.body;
      return { ok: true, json: async () => ({ ok: true, ts: '123' }) };
    });

    await sendGpmReportSlackSummary({
      supabase: makeSupabaseMock([DEST_ROW]) as any,
      startupWorkspaceId: 'ws-1',
      payload: makePayload(),
      pdfUrl: null,
      configId: 'cfg-1',
    });

    expect(capturedBody).toBeTruthy();
    const parsed = JSON.parse(capturedBody) as { text: string; channel: string };
    expect(parsed.channel).toBe('C123');
    expect(parsed.text).toContain('elitephysio.ca');
  });

  it('includes PDF link in message when pdfUrl provided', async () => {
    let capturedBody = '';
    vi.stubGlobal('fetch', async (_url: string, init: { body: string }) => {
      capturedBody = init.body;
      return { ok: true, json: async () => ({ ok: true, ts: '123' }) };
    });

    await sendGpmReportSlackSummary({
      supabase: makeSupabaseMock([DEST_ROW]) as any,
      startupWorkspaceId: 'ws-1',
      payload: makePayload(),
      pdfUrl: 'https://cdn.example.com/report.pdf',
      configId: 'cfg-1',
    });

    const parsed = JSON.parse(capturedBody) as { text: string };
    expect(parsed.text).toContain('https://cdn.example.com/report.pdf');
  });

  it('does nothing when no active destination exists', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await sendGpmReportSlackSummary({
      supabase: makeSupabaseMock([]) as any,
      startupWorkspaceId: 'ws-1',
      payload: makePayload(),
      pdfUrl: null,
      configId: 'cfg-1',
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
