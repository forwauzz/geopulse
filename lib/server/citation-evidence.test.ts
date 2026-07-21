import { describe, expect, it } from 'vitest';
import { extractMentionSentence, getCitationEvidence, runModeLabel } from './citation-evidence';

describe('extractMentionSentence', () => {
  it('returns the sentence containing the domain', () => {
    const text = 'Several firms serve Montreal. MIPS Media (mipsmedia.com) offers 24/7 support. Others exist.';
    expect(extractMentionSentence(text, 'mipsmedia.com')).toBe(
      'MIPS Media (mipsmedia.com) offers 24/7 support.'
    );
  });

  it('is case-insensitive and null when absent', () => {
    expect(extractMentionSentence('Try MIPSMEDIA.COM today', 'mipsmedia.com')).toContain('MIPSMEDIA.COM');
    expect(extractMentionSentence('nothing here', 'mipsmedia.com')).toBeNull();
  });
});

describe('runModeLabel', () => {
  it('explains each mode in user language', () => {
    expect(runModeLabel('blind_discovery')).toMatch(/cold/);
    expect(runModeLabel('ungrounded_inference')).toMatch(/brand-aware/);
    expect(runModeLabel('grounded_site')).toMatch(/site-assisted/);
  });
});

function fakeSupabase(args: {
  domainId: string | null;
  groups: Array<Record<string, unknown>>;
  runsByGroup: Record<string, Array<Record<string, unknown>>>;
  queries: Array<{ id: string; query_text: string }>;
  citations: Array<{ query_run_id: string; cited_domain: string }>;
}) {
  return {
    from(table: string) {
      const listResult = (rows: unknown[]) => ({
        select: () => ({
          eq: (_c: string, v: unknown) => ({
            maybeSingle: async () => ({ data: args.domainId ? { id: args.domainId } : null }),
            order: () => ({ limit: async () => ({ data: rows }) }),
            // query_runs path: .eq('run_group_id', id) → thenable-ish via async in()
            then: undefined,
          }),
          in: () => ({ then: undefined }),
        }),
      });
      if (table === 'benchmark_domains') return listResult([]);
      if (table === 'benchmark_run_groups') {
        return {
          select: () => ({
            eq: () => ({ order: () => ({ limit: async () => ({ data: args.groups }) }) }),
          }),
        };
      }
      if (table === 'query_runs') {
        return {
          select: () => ({
            eq: async (_c: string, groupId: string) => ({ data: args.runsByGroup[groupId] ?? [] }),
          }),
        };
      }
      if (table === 'benchmark_queries') {
        return { select: () => ({ in: async () => ({ data: args.queries }) }) };
      }
      if (table === 'query_citations') {
        return { select: () => ({ in: async () => ({ data: args.citations }) }) };
      }
      return listResult([]);
    },
  };
}

describe('getCitationEvidence', () => {
  it('prefers blind runs, marks losses with who was named instead, and losses sort first', async () => {
    const supabase = fakeSupabase({
      domainId: 'd-1',
      groups: [
        // newer brand-aware run must lose to the older blind run
        { id: 'g-brand', model_set_version: 'gemini-2.5', metadata: { run_mode: 'ungrounded_inference' }, started_at: '2026-07-21' },
        { id: 'g-blind', model_set_version: 'gemini-2.5', metadata: { run_mode: 'blind_discovery' }, started_at: '2026-07-20' },
      ],
      runsByGroup: {
        'g-blind': [
          { id: 'r1', query_id: 'q1', status: 'completed', response_text: 'Best options include example.com for sure.' },
          { id: 'r2', query_id: 'q2', status: 'completed', response_text: 'Try competitor.com or other.com.' },
        ],
      },
      queries: [
        { id: 'q1', query_text: 'Who is best?' },
        { id: 'q2', query_text: 'Who else?' },
      ],
      citations: [
        { query_run_id: 'r1', cited_domain: 'example.com' },
        { query_run_id: 'r2', cited_domain: 'competitor.com' },
        { query_run_id: 'r2', cited_domain: 'other.com' },
      ],
    });

    const evidence = await getCitationEvidence({ supabase, domain: 'www.Example.com' });
    expect(evidence).toHaveLength(1);
    const gemini = evidence[0]!;
    expect(gemini.runMode).toBe('blind_discovery');
    expect(gemini.citedCount).toBe(1);
    expect(gemini.totalCount).toBe(2);
    // Losses first.
    expect(gemini.rows[0]).toMatchObject({ cited: false, namedInstead: ['competitor.com', 'other.com'] });
    expect(gemini.rows[1]?.excerpt).toContain('example.com');
  });

  it('returns empty for untracked domains', async () => {
    const supabase = fakeSupabase({ domainId: null, groups: [], runsByGroup: {}, queries: [], citations: [] });
    expect(await getCitationEvidence({ supabase, domain: 'nobody.com' })).toEqual([]);
  });
});
