import { describe, expect, it } from 'vitest';
import {
  DEFAULT_AUTOPILOT_DAILY_CAP,
  DEFAULT_AUTOPILOT_HOUR_UTC,
  resolveMarketingAutopilotConfig,
  selectNextBatch,
  selectProposalCandidates,
} from './marketing-autopilot';
import type { TopicRegistrySeedItem } from './content-topic-registry-seed';

function seed(slug: string): TopicRegistrySeedItem {
  return {
    content_id: `cid-${slug}`,
    slug,
    title: slug,
    status: 'brief',
    content_type: 'article',
    target_persona: null,
    primary_problem: null,
    topic_cluster: 'cluster',
    keyword_cluster: 'kw',
    cta_goal: 'free_scan',
    source_type: 'internal_plus_research',
    source_links: [],
    brief_markdown: '# brief',
    draft_markdown: '',
    metadata: {},
  };
}

describe('resolveMarketingAutopilotConfig', () => {
  it('safe defaults: disabled, not killed, default cap + hour', () => {
    const c = resolveMarketingAutopilotConfig(undefined);
    expect(c.enabled).toBe(false);
    expect(c.killed).toBe(false);
    expect(c.dailyCap).toBe(DEFAULT_AUTOPILOT_DAILY_CAP);
    expect(c.hourUtc).toBe(DEFAULT_AUTOPILOT_HOUR_UTC);
  });

  it('parses flags, clamps the cap to 10, validates the hour', () => {
    expect(resolveMarketingAutopilotConfig({ MARKETING_AUTOPILOT_ENABLED: 'true' }).enabled).toBe(true);
    expect(resolveMarketingAutopilotConfig({ MARKETING_AUTOPILOT_KILL: '1' }).killed).toBe(true);
    expect(resolveMarketingAutopilotConfig({ MARKETING_AUTOPILOT_DAILY_CAP: '99' }).dailyCap).toBe(10);
    expect(resolveMarketingAutopilotConfig({ MARKETING_AUTOPILOT_DAILY_CAP: '3' }).dailyCap).toBe(3);
    expect(resolveMarketingAutopilotConfig({ MARKETING_AUTOPILOT_HOUR_UTC: '25' }).hourUtc).toBe(DEFAULT_AUTOPILOT_HOUR_UTC);
    expect(resolveMarketingAutopilotConfig({ MARKETING_AUTOPILOT_HOUR_UTC: '6' }).hourUtc).toBe(6);
  });
});

describe('selectNextBatch', () => {
  it('picks the earliest batch with remaining topics', () => {
    expect(selectNextBatch([
      { batch: 'batch_1', remaining_count: 0 },
      { batch: 'batch_2', remaining_count: 5 },
      { batch: 'batch_3', remaining_count: 9 },
    ])).toBe('batch_2');
  });

  it('returns null when everything is covered', () => {
    expect(selectNextBatch([
      { batch: 'batch_1', remaining_count: 0 },
      { batch: 'batch_2', remaining_count: 0 },
      { batch: 'batch_3', remaining_count: 0 },
    ])).toBeNull();
  });
});

describe('selectProposalCandidates', () => {
  const candidates = [seed('a'), seed('b'), seed('c'), seed('d')];

  it('drops already-covered slugs/ids and caps the count', () => {
    const picks = selectProposalCandidates(candidates, new Set(['a']), new Set(['cid-b']), 2);
    expect(picks.map((p) => p.slug)).toEqual(['c', 'd']);
  });

  it('returns [] when the cap is 0', () => {
    expect(selectProposalCandidates(candidates, new Set(), new Set(), 0)).toEqual([]);
  });

  it('returns all remaining when the cap exceeds availability', () => {
    expect(selectProposalCandidates(candidates, new Set(['a', 'b', 'c']), new Set(), 5).map((p) => p.slug)).toEqual(['d']);
  });
});
