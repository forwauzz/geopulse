import { describe, expect, it } from 'vitest';
import {
  buildAccessMatrix,
  classifyFetchFailure,
  safelistStepsFor,
} from './access-matrix';

const openRobots = 'User-agent: *\nAllow: /';

describe('classifyFetchFailure', () => {
  it('detects a Cloudflare challenge from headers', () => {
    const c = classifyFetchFailure({
      status: 403,
      headers: { 'cf-mitigated': 'challenge', server: 'cloudflare' },
      reason: 'Target returned HTTP 403',
    });
    expect(c.kind).toBe('waf_challenge');
  });

  it('classifies 403 without WAF headers as forbidden and names the likely vendor', () => {
    const c = classifyFetchFailure({
      status: 403,
      headers: { server: 'cloudflare' },
      reason: 'Target returned HTTP 403',
    });
    expect(c.kind).toBe('http_forbidden');
    expect(c.rootCause).toContain('Cloudflare');
  });

  it('classifies timeouts', () => {
    const c = classifyFetchFailure({ reason: 'Failed to fetch URL (timeout or network error)' });
    expect(c.kind).toBe('timeout_or_network');
  });

  it('classifies plain server errors', () => {
    const c = classifyFetchFailure({ status: 500, reason: 'Target returned HTTP 500' });
    expect(c.kind).toBe('http_error');
    expect(c.rootCause).toContain('500');
  });
});

describe('buildAccessMatrix — open site, page fetched', () => {
  const m = buildAccessMatrix({
    robotsTxt: openRobots,
    pageFetched: true,
    signals: { noindex: false, snippetRestricted: false },
  });

  it('marks every destination eligible', () => {
    expect(m.rows).toHaveLength(5);
    for (const row of m.rows) expect(row.status).toBe('eligible');
  });

  it('AI Overviews row cites the correct control — never Google-Extended', () => {
    const g = m.rows.find((r) => r.destination === 'google_search_ai_overviews');
    expect(g?.control).toContain('Googlebot');
    expect(g?.control).toContain('not Google-Extended');
  });

  it('training panel lists training bots as allowed, framed as a choice', () => {
    expect(m.trainingPanel.length).toBeGreaterThanOrEqual(4);
    const gext = m.trainingPanel.find((t) => t.token === 'Google-Extended');
    expect(gext?.allowed).toBe(true);
    expect(gext?.note).toContain('NOT affect Google Search');
  });

  it('never grades an eligibility row on a training bot', () => {
    const details = m.rows.map((r) => r.detail).join(' ');
    expect(details).not.toContain('GPTBot');
    expect(details).not.toContain('ClaudeBot');
    expect(details).not.toContain('Google-Extended');
    // The only sanctioned mention is the explicit disclaimer in the Google control string.
    const g = m.rows.find((r) => r.destination === 'google_search_ai_overviews');
    expect(g?.control).toContain('not Google-Extended');
  });
});

describe('buildAccessMatrix — retrieval agents blocked, training allowed', () => {
  const robots =
    'User-agent: OAI-SearchBot\nDisallow: /\n\nUser-agent: PerplexityBot\nDisallow: /\n\nUser-agent: *\nAllow: /';
  const m = buildAccessMatrix({
    robotsTxt: robots,
    pageFetched: true,
    signals: { noindex: false, snippetRestricted: false },
  });

  it('blocks ChatGPT Search and Perplexity, keeps Claude/Bing/Google eligible', () => {
    expect(m.rows.find((r) => r.destination === 'chatgpt_search')?.status).toBe('blocked');
    expect(m.rows.find((r) => r.destination === 'perplexity')?.status).toBe('blocked');
    expect(m.rows.find((r) => r.destination === 'claude')?.status).toBe('eligible');
    expect(m.rows.find((r) => r.destination === 'bing_copilot')?.status).toBe('eligible');
    expect(m.rows.find((r) => r.destination === 'google_search_ai_overviews')?.status).toBe('eligible');
  });
});

describe('buildAccessMatrix — training blocked is NOT a visibility failure', () => {
  const robots =
    'User-agent: GPTBot\nDisallow: /\n\nUser-agent: ClaudeBot\nDisallow: /\n\nUser-agent: Google-Extended\nDisallow: /';
  const m = buildAccessMatrix({
    robotsTxt: robots,
    pageFetched: true,
    signals: { noindex: false, snippetRestricted: false },
  });

  it('keeps all destinations eligible', () => {
    for (const row of m.rows) expect(row.status).toBe('eligible');
  });

  it('shows the opt-outs in the training panel', () => {
    expect(m.trainingPanel.find((t) => t.token === 'GPTBot')?.allowed).toBe(false);
    expect(m.trainingPanel.find((t) => t.token === 'Google-Extended')?.allowed).toBe(false);
  });
});

describe('buildAccessMatrix — scanner blocked by WAF (C4)', () => {
  const m = buildAccessMatrix({
    robotsTxt: openRobots,
    pageFetched: false,
    failure: {
      status: 403,
      headers: { 'cf-mitigated': 'challenge', server: 'cloudflare' },
      reason: 'Target returned HTTP 403',
    },
  });

  it('marks robots-allowed destinations as not_tested, never blocked/failed', () => {
    for (const row of m.rows) expect(row.status).toBe('not_tested');
  });

  it('emits a root cause and safelist steps', () => {
    expect(m.diagnosis.pageFetched).toBe(false);
    expect(m.diagnosis.blockKind).toBe('waf_challenge');
    expect(m.diagnosis.rootCause).toBeTruthy();
    expect(m.diagnosis.safelistSteps.length).toBeGreaterThan(2);
    expect(m.diagnosis.safelistSteps.join(' ')).toContain('OAI-SearchBot');
  });

  it('still grades robots-level blocks even when the page fetch failed', () => {
    const blocked = buildAccessMatrix({
      robotsTxt: 'User-agent: PerplexityBot\nDisallow: /',
      pageFetched: false,
      failure: { status: 403, reason: 'Target returned HTTP 403' },
    });
    expect(blocked.rows.find((r) => r.destination === 'perplexity')?.status).toBe('blocked');
  });
});

describe('buildAccessMatrix — noindex/nosnippet gates Google AI Overviews', () => {
  it('noindex blocks the Google row', () => {
    const m = buildAccessMatrix({
      robotsTxt: openRobots,
      pageFetched: true,
      signals: { noindex: true, snippetRestricted: false },
    });
    const g = m.rows.find((r) => r.destination === 'google_search_ai_overviews');
    expect(g?.status).toBe('blocked');
    expect(g?.detail).toContain('noindex');
  });

  it('nosnippet blocks AI Overviews eligibility via the snippet control', () => {
    const m = buildAccessMatrix({
      robotsTxt: openRobots,
      pageFetched: true,
      signals: { noindex: false, snippetRestricted: true },
    });
    const g = m.rows.find((r) => r.destination === 'google_search_ai_overviews');
    expect(g?.status).toBe('blocked');
    expect(g?.control).toContain('Snippet');
  });
});

describe('safelistStepsFor', () => {
  it('returns no steps when not blocked', () => {
    expect(safelistStepsFor('not_blocked')).toEqual([]);
  });
});
