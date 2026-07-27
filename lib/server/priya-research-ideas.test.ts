import { describe, expect, it, vi } from 'vitest';
import {
  classifyPriyaIdeaChannel,
  socialTrendToPriyaIdea,
  upsertPriyaResearchIdeas,
} from './priya-research-ideas';

describe('Priya research ideas', () => {
  it('classifies Google, Reddit, and X sources', () => {
    expect(classifyPriyaIdeaChannel('https://www.reddit.com/r/seo')).toBe('reddit');
    expect(classifyPriyaIdeaChannel('https://x.com/example/status/1')).toBe('twitter');
    expect(classifyPriyaIdeaChannel('https://developers.google.com/search')).toBe('google');
  });

  it('creates a disclosed reply draft only for community research', () => {
    const row = socialTrendToPriyaIdea({
      key: 'one',
      slot: 'timely',
      audience: 'agency',
      title: 'What teams need from GEO',
      hook: 'A score without evidence is not enough.',
      angle: 'Explain prompts, citations, and next actions.',
      caption: 'Start with the buyer questions that matter.',
      sourceUrl: 'https://reddit.com/r/seo/comments/example',
      sourceLabel: 'Reddit',
      sourceType: 'community',
      whyNow: 'Teams are comparing tools.',
      discoveredAt: '2026-07-27T00:00:00.000Z',
      score: 82,
      safeForAutonomousPublish: false,
    });
    expect(row.channel).toBe('reddit');
    expect(row.replyDraft).toContain('full disclosure');
  });

  it('upserts idempotently into Priya’s existing opportunity queue', async () => {
    const maybeSingle = vi.fn(async () => ({ data: null }));
    const eqKey = vi.fn(() => ({ maybeSingle }));
    const select = vi.fn(() => ({ eq: eqKey }));
    const insert = vi.fn(async () => ({ error: null }));
    const db = { from: vi.fn(() => ({ select, insert })) } as any;

    const saved = await upsertPriyaResearchIdeas(db, [{
      channel: 'twitter',
      title: 'Connect AI visibility to revenue',
      evidence: 'Buyers do not want another score-only dashboard.',
      recommendation: 'Show the measured prompt, evidence, action, and business outcome.',
      sourceUrl: 'https://x.com/example/status/1',
      sourceLabel: 'X',
      score: 88,
    }], new Date('2026-07-27T00:00:00.000Z'));

    expect(saved).toBe(1);
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      kind: 'content_gap',
      priority: 1,
      status: 'queued',
      metadata: expect.objectContaining({
        research_channel: 'twitter',
        public_reply_requires_approval: true,
      }),
    }));
  });
});
