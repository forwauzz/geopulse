import { describe, expect, it } from 'vitest';
import {
  canonicalizeDomain,
  engineForModelId,
  loadEngineCitationMetrics,
} from './dashboard-citation-metrics';

function fakeSupabase(args: {
  domainId: string | null;
  metricRows: Array<Record<string, unknown>>;
}) {
  return {
    from(table: string) {
      if (table === 'benchmark_domains') {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: args.domainId ? { id: args.domainId } : null,
                error: null,
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            order: () => ({
              limit: async () => ({ data: args.metricRows, error: null }),
            }),
          }),
        }),
      };
    },
  };
}

describe('engineForModelId', () => {
  it('maps model families to engines', () => {
    expect(engineForModelId('gemini-2.5-flash-lite')).toBe('gemini');
    expect(engineForModelId('gpt-4o-mini')).toBe('chatgpt');
    expect(engineForModelId('llama-3.1-sonar-small-128k-online')).toBe('perplexity');
    expect(engineForModelId('claude-haiku-4-5-20251001')).toBe('claude');
    expect(engineForModelId('mistral-7b')).toBeNull();
  });
});

describe('canonicalizeDomain', () => {
  it('normalizes case and www', () => {
    expect(canonicalizeDomain('WWW.Example.COM')).toBe('example.com');
  });
});

describe('loadEngineCitationMetrics', () => {
  it('returns empty for a domain that is not benchmarked', async () => {
    const supabase = fakeSupabase({ domainId: null, metricRows: [] });
    const metrics = await loadEngineCitationMetrics({ supabase, domain: 'example.com' });
    expect(metrics).toEqual({});
  });

  it('prefers blind discovery over every assisted mode', async () => {
    const supabase = fakeSupabase({
      domainId: 'd-1',
      metricRows: [
        {
          model_id: 'gpt-4o-mini',
          citation_rate: 0.9,
          metrics: { run_mode: 'ungrounded_inference' },
          computed_at: '2026-07-20T12:00:00Z',
        },
        {
          model_id: 'gpt-4o-mini',
          citation_rate: 0,
          metrics: { run_mode: 'blind_discovery' },
          computed_at: '2026-07-20T11:00:00Z',
        },
        {
          model_id: 'gpt-4o-mini',
          citation_rate: 1,
          metrics: { run_mode: 'grounded_site' },
          computed_at: '2026-07-20T13:00:00Z',
        },
      ],
    });
    const metrics = await loadEngineCitationMetrics({ supabase, domain: 'example.com' });
    // The honest cold number wins even when assisted modes are newer and higher.
    expect(metrics.chatgpt?.citationRate).toBe(0);
    expect(metrics.chatgpt?.runMode).toBe('blind_discovery');
  });

  it('keeps the newest ungrounded metric per engine', async () => {
    const supabase = fakeSupabase({
      domainId: 'd-1',
      metricRows: [
        // newest first
        {
          model_id: 'gemini-2.5-flash-lite',
          citation_rate: 0.9,
          metrics: { run_mode: 'grounded_site' },
          computed_at: '2026-07-19T00:00:00Z',
        },
        {
          model_id: 'gemini-2.5-flash-lite',
          citation_rate: 0.4,
          metrics: { run_mode: 'ungrounded_inference' },
          computed_at: '2026-07-18T00:00:00Z',
        },
        {
          model_id: 'gemini-2.5-flash-lite',
          citation_rate: 0.2,
          metrics: { run_mode: 'ungrounded_inference' },
          computed_at: '2026-07-10T00:00:00Z',
        },
        {
          model_id: 'gpt-4o-mini',
          citation_rate: 0.6,
          metrics: { run_mode: 'ungrounded_inference' },
          computed_at: '2026-07-18T00:00:00Z',
        },
      ],
    });
    const metrics = await loadEngineCitationMetrics({ supabase, domain: 'www.example.com' });
    // Ungrounded wins over the newer grounded row; the newest ungrounded wins over older ones.
    expect(metrics.gemini?.citationRate).toBe(0.4);
    expect(metrics.gemini?.runMode).toBe('ungrounded_inference');
    expect(metrics.chatgpt?.citationRate).toBe(0.6);
    expect(metrics.perplexity).toBeUndefined();
  });

  it('falls back to a grounded metric when no ungrounded run exists', async () => {
    const supabase = fakeSupabase({
      domainId: 'd-1',
      metricRows: [
        {
          model_id: 'gemini-2.5-flash-lite',
          citation_rate: 0.88,
          metrics: { run_mode: 'grounded_site' },
          computed_at: '2026-07-19T00:00:00Z',
        },
      ],
    });
    const metrics = await loadEngineCitationMetrics({ supabase, domain: 'example.com' });
    expect(metrics.gemini?.citationRate).toBe(0.88);
    expect(metrics.gemini?.runMode).toBe('grounded_site');
  });
});
