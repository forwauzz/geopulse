import { describe, expect, it } from 'vitest';
import { buildDailySocialSlate, parseSocialTrendDiscovery } from './social-trend-agent';

function rawIdea(slot: 'timely' | 'humor' | 'carousel' | 'proof', index: number) {
  return {
    slot,
    audience: index % 2 === 0 ? 'agency' : 'small_business',
    title: `${slot} idea ${index}`,
    hook: `A useful ${slot} hook`,
    angle: 'Explain the pattern without copying the source.',
    caption: 'Here is what this changes in practice. Run a free scan.',
    source_url: `https://example.com/${slot}/${index}`,
    source_label: 'Official example',
    source_type: 'official',
    why_now: 'Published recently and relevant to AI visibility.',
    relevance: 9,
    timeliness: 8,
    usefulness: 9,
    conversion_fit: 7,
  };
}

describe('Sofia social trend intelligence', () => {
  it('parses, scores, and bounds grounded ideas', () => {
    const ideas = parseSocialTrendDiscovery(
      JSON.stringify({
        ideas: [
          rawIdea('timely', 1),
          { ...rawIdea('humor', 2), source_type: 'community' },
          { ...rawIdea('proof', 3), source_url: 'javascript:alert(1)' },
        ],
      }),
      '2026-07-24T12:00:00.000Z'
    );

    expect(ideas).toHaveLength(2);
    expect(ideas[0]).toMatchObject({
      score: 83,
      discoveredAt: '2026-07-24T12:00:00.000Z',
    });
    expect(ideas.find((idea) => idea.slot === 'timely')?.safeForAutonomousPublish).toBe(true);
    expect(ideas.find((idea) => idea.slot === 'humor')?.safeForAutonomousPublish).toBe(false);
  });

  it('rejects inflated public claims', () => {
    const ideas = parseSocialTrendDiscovery(
      JSON.stringify({
        ideas: [{ ...rawIdea('timely', 1), caption: 'Guaranteed rankings. Dominate AI search.' }],
      })
    );
    expect(ideas).toEqual([]);
  });

  it('builds one varied four-slot slate without repeating recent ideas or sources', () => {
    const ideas = parseSocialTrendDiscovery(
      JSON.stringify({
        ideas: [
          rawIdea('timely', 1),
          rawIdea('humor', 2),
          rawIdea('carousel', 3),
          rawIdea('proof', 4),
          { ...rawIdea('timely', 5), source_url: 'https://example.com/timely/1' },
        ],
      })
    );
    const slate = buildDailySocialSlate(ideas, new Set([ideas[1]!.key]));
    expect(slate.map((idea) => idea.slot)).toEqual(['timely', 'carousel', 'proof']);
    expect(new Set(slate.map((idea) => idea.sourceUrl)).size).toBe(slate.length);
  });
});
