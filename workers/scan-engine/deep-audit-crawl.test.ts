import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchHtmlPage } from '../lib/fetch-gate';
import { parseCrawlPending, runDeepAuditCrawl } from './deep-audit-crawl';
import { auditPageFromHtml } from './run-scan';
import { extractSameOriginLinks, normalizeUrlKey } from './crawl-url-utils';

vi.mock('../lib/fetch-gate', () => ({
  fetchHtmlPage: vi.fn(),
}));

vi.mock('./run-scan', () => ({
  auditPageFromHtml: vi.fn(),
}));

vi.mock('./robots-and-sitemap', () => ({
  crawlDelayMsFromRobotsSeconds: vi.fn(() => 0),
  fetchRobotsTxt: vi.fn(async () => ({ ok: true, status: 200, text: '' })),
  fetchSitemapXml: vi.fn(async () => ({ ok: false, reason: 'missing' })),
  isPathAllowedByRobots: vi.fn(() => true),
  parseRobotsTxt: vi.fn(() => ({ disallows: [], sitemapUrls: [], crawlDelaySeconds: null })),
  parseSitemapLocs: vi.fn(() => []),
}));

type ScanRunRow = {
  id: string;
  config: Record<string, unknown>;
  started_at: string | null;
  completed_at?: string | null;
  coverage_summary?: Record<string, unknown> | null;
};

type ScanPageRow = {
  id: string;
  run_id: string;
  url: string;
  normalized_url: string;
  status: string;
  score?: number | null;
  letter_grade?: string | null;
  issues_json?: unknown;
  created_at: string;
};

function pickColumns<T extends Record<string, unknown>>(row: T, columns: string): Record<string, unknown> {
  if (!columns || columns === '*') return { ...row };
  const picked: Record<string, unknown> = {};
  for (const part of columns.split(',')) {
    const key = part.trim();
    if (!key) continue;
    picked[key] = row[key];
  }
  return picked;
}

class FakeQuery {
  private filters = new Map<string, unknown>();
  private selected = '*';
  private countMode = false;
  private headMode = false;
  private insertPayload: Record<string, unknown> | null = null;
  private updatePayload: Record<string, unknown> | null = null;

  constructor(
    private readonly table: 'scan_runs' | 'scan_pages',
    private readonly state: {
      scanRuns: ScanRunRow[];
      scanPages: ScanPageRow[];
      nextPageId: number;
    }
  ) {}

  select(columns: string, options?: { count?: 'exact'; head?: boolean }) {
    this.selected = columns;
    this.countMode = options?.count === 'exact';
    this.headMode = options?.head === true;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.set(column, value);
    return this;
  }

  insert(payload: Record<string, unknown>) {
    this.insertPayload = payload;
    if (this.table === 'scan_pages') {
      this.state.scanPages.push({
        id: `page-${this.state.nextPageId++}`,
        run_id: String(payload['run_id']),
        url: String(payload['url']),
        normalized_url: String(payload['normalized_url']),
        status: String(payload['status']),
        score: typeof payload['score'] === 'number' ? (payload['score'] as number) : null,
        letter_grade: typeof payload['letter_grade'] === 'string' ? (payload['letter_grade'] as string) : null,
        issues_json: payload['issues_json'],
        created_at: new Date(this.state.nextPageId * 1_000).toISOString(),
      });
    }
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.updatePayload = payload;
    return this;
  }

  order() {
    return this;
  }

  maybeSingle() {
    return Promise.resolve(this.execSingle());
  }

  single() {
    return Promise.resolve(this.execSingle());
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: null; count?: number }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ) {
    return Promise.resolve(this.exec()).then(onfulfilled, onrejected);
  }

  private matches(row: Record<string, unknown>): boolean {
    for (const [key, value] of this.filters.entries()) {
      if (row[key] !== value) return false;
    }
    return true;
  }

  private execSingle() {
    const rows = this.rows().filter((row) => this.matches(row));
    const row = rows[0];
    return {
      data: row ? pickColumns(row, this.selected) : null,
      error: null,
    };
  }

  private exec() {
    if (this.updatePayload) {
      for (const row of this.rows()) {
        if (!this.matches(row)) continue;
        Object.assign(row, this.updatePayload);
      }
      return { data: null, error: null };
    }

    if (this.insertPayload && this.table === 'scan_pages') {
      const inserted = this.state.scanPages[this.state.scanPages.length - 1];
      if (!inserted) {
        throw new Error('missing_inserted_scan_page');
      }
      return {
        data: pickColumns(inserted, this.selected),
        error: null,
      };
    }

    const rows = this.rows().filter((row) => this.matches(row));
    if (this.countMode) {
      return {
        data: this.headMode ? null : rows.map((row) => pickColumns(row, this.selected)),
        error: null,
        count: rows.length,
      };
    }

    return {
      data: rows.map((row) => pickColumns(row, this.selected)),
      error: null,
    };
  }

  private rows(): Record<string, unknown>[] {
    return this.table === 'scan_runs' ? this.state.scanRuns : this.state.scanPages;
  }
}

function createFakeSupabase(initialConfig?: Record<string, unknown>) {
  const state = {
    scanRuns: [
      {
        id: 'run-1',
        config: initialConfig ?? {},
        started_at: null,
        completed_at: null,
        coverage_summary: null,
      },
    ] satisfies ScanRunRow[],
    scanPages: [] as ScanPageRow[],
    nextPageId: 1,
  };

  return {
    state,
    client: {
      from(table: 'scan_runs' | 'scan_pages') {
        return new FakeQuery(table, state);
      },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fetchHtmlPage).mockImplementation(async (url: string) => {
    if (url === 'https://example.com/') {
      return {
        ok: true,
        html: '<a href="/a">A</a><a href="/b">B</a><a href="/c">C</a>',
        finalUrl: 'https://example.com/',
      };
    }
    return {
      ok: true,
      html: '<html><body>detail</body></html>',
      finalUrl: url,
    };
  });
  vi.mocked(auditPageFromHtml).mockImplementation(async (url: string) => {
    const scoreByUrl: Record<string, number> = {
      'https://example.com/': 80,
      'https://example.com/a': 70,
      'https://example.com/b': 60,
      'https://example.com/c': 50,
    };
    const score = scoreByUrl[url] ?? 40;
    return {
      score,
      letterGrade: score >= 70 ? 'B' : 'C',
      issues: [
        {
          checkId: 'jsonld',
          check: 'Structured data',
          passed: score >= 70,
          status: score >= 70 ? 'PASS' : 'FAIL',
          category: 'extractability',
          finding: score >= 70 ? 'Structured data present.' : 'Structured data missing.',
          weight: 10,
          fix: 'Add JSON-LD on key pages.',
        },
      ],
      topIssues: [],
      categoryScores: [],
    };
  });
});

describe('normalizeUrlKey', () => {
  it('lowercases host and strips fragment', () => {
    expect(normalizeUrlKey('HTTPS://Example.COM/path#frag')).toBe('https://example.com/path');
  });

  it('returns empty for non-http(s)', () => {
    expect(normalizeUrlKey('ftp://x.com/')).toBe('');
  });
});

describe('parseCrawlPending', () => {
  it('returns null for invalid input', () => {
    expect(parseCrawlPending(null)).toBeNull();
    expect(parseCrawlPending({})).toBeNull();
  });

  it('parses legacy partial without robots metadata', () => {
    const p = parseCrawlPending({
      ordered_urls: ['https://a.com/'],
      next_index: 10,
      chunk_size: 25,
      crawl_delay_ms: 0,
      sitemap_norms: [],
      seed_norm: 'https://a.com/',
    });
    expect(p).not.toBeNull();
    expect(p?.robots_status).toBe(200);
    expect(p?.sitemap_urls_considered).toBe(1);
    expect(p?.chunks_processed).toBe(1);
    expect(p?.started_at).toBeNull();
    expect(p?.browser_render_attempted).toBe(0);
    expect(p?.browser_render_succeeded).toBe(0);
    expect(p?.browser_render_failed).toBe(0);
    expect(p?.browser_render_browser_ms_used).toBe(0);
  });

  it('parses chunk progress metadata when present', () => {
    const p = parseCrawlPending({
      ordered_urls: ['https://a.com/', 'https://a.com/docs'],
      next_index: 25,
      chunk_size: 25,
      crawl_delay_ms: 300,
      sitemap_norms: ['https://a.com/docs'],
      seed_norm: 'https://a.com/',
      robots_status: 200,
      sitemap_urls_considered: 2,
      chunks_processed: 3,
      started_at: '2026-03-26T12:00:00.000Z',
      browser_render_attempted: 4,
      browser_render_succeeded: 3,
      browser_render_failed: 1,
      browser_render_browser_ms_used: 1200,
    });
    expect(p).not.toBeNull();
    expect(p?.chunks_processed).toBe(3);
    expect(p?.started_at).toBe('2026-03-26T12:00:00.000Z');
    expect(p?.browser_render_attempted).toBe(4);
    expect(p?.browser_render_succeeded).toBe(3);
    expect(p?.browser_render_failed).toBe(1);
    expect(p?.browser_render_browser_ms_used).toBe(1200);
  });
});

describe('extractSameOriginLinks', () => {
  it('collects same-origin https links', () => {
    const html =
      '<a href="/a">a</a><a href="https://example.com/b">b</a><a href="https://other.com/x">x</a>';
    const links = extractSameOriginLinks(html, 'https://example.com/', 20);
    expect(links).toContain('https://example.com/a');
    expect(links).toContain('https://example.com/b');
    expect(links.some((u) => u.includes('other.com'))).toBe(false);
  });
});

describe('runDeepAuditCrawl', () => {
  it('requeues large crawls across chunks and records final chunk metrics', async () => {
    const { client, state } = createFakeSupabase({ page_limit: 4, chunk_size: 2 });

    const first = await runDeepAuditCrawl(client as never, {} as never, {
      runId: 'run-1',
      seedUrl: 'https://example.com/',
      pageLimit: 4,
      chunkSize: 2,
    });

    expect(first).toEqual({ ok: true, phase: 'partial' });
    expect(state.scanPages.filter((row) => row.status === 'fetched')).toHaveLength(2);
    expect(state.scanRuns[0]?.config['crawl_pending']).toMatchObject({
      next_index: 2,
      chunk_size: 2,
      chunks_processed: 1,
    });

    const second = await runDeepAuditCrawl(client as never, {} as never, {
      runId: 'run-1',
      seedUrl: 'https://example.com/',
      pageLimit: 4,
      chunkSize: 2,
    });

    expect(second.ok).toBe(true);
    if (!second.ok) {
      throw new Error(second.reason);
    }
    expect(second.phase).toBe('complete');
    if (second.phase !== 'complete') {
      throw new Error(`expected_complete_phase_received_${second.phase}`);
    }
    expect(second.aggregateScore).toBe(65);
    expect(state.scanPages.filter((row) => row.status === 'fetched')).toHaveLength(4);
    expect(state.scanRuns[0]?.config['crawl_pending']).toBeUndefined();
    expect(state.scanRuns[0]?.coverage_summary).toMatchObject({
      pages_fetched: 4,
      pages_errored: 0,
      chunked: true,
      chunk_size: 2,
      chunks_processed: 2,
      urls_planned: 4,
      urls_remaining: 0,
      page_limit: 4,
    });
  });
});
