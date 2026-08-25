import { describe, expect, it } from 'vitest';
import {
  buildJordanReelScript,
  chooseJordanReelSource,
  jordanReelAttemptKey,
  jordanReelSlotKey,
  resolveJordanReelConfig,
  shouldPlanJordanReel,
} from './jordan-reel-production';

function asset(overrides: Record<string, unknown> = {}) {
  return {
    id: 'row',
    asset_id: 'asset',
    asset_type: 'short_video_post',
    provider_family: 'instagram',
    metadata: {},
    created_at: '2026-07-20T12:00:00.000Z',
    ...overrides,
  } as never;
}

const source = {
  key: 'sofia-search-console',
  kind: 'timely',
  title: 'Google Search Console adds AI visibility signals',
  caption: 'Ranking alone does not explain whether an answer engine can extract a useful answer.',
  evidence: {
    research_agent: 'sofia',
    source_url: 'https://developers.google.com/search/blog/example',
    source_label: 'Google Search Central',
    hook: 'Your search report is missing the AI visibility gap.',
    original_angle: 'Ranking and recommendation are related, but they are not the same signal.',
  },
};

describe('Jordan autonomous Reel production', () => {
  it('enables brief creation by default while preserving an explicit kill switch', () => {
    expect(resolveJordanReelConfig({}).enabled).toBe(true);
    expect(resolveJordanReelConfig({ reels_enabled: false }).enabled).toBe(false);
  });

  it('defaults to four weekly slots without changing the four-post daily schedule', () => {
    const config = resolveJordanReelConfig({ reels_enabled: true });
    expect(config).toMatchObject({
      enabled: true,
      reelsPerWeek: 4,
      daysLocal: [0, 2, 4, 6],
      publishMode: 'autonomous',
    });
  });

  it('plans at most one idempotent Reel per eligible local day', () => {
    const now = new Date('2026-07-26T14:00:00.000Z');
    const config = resolveJordanReelConfig({ reels_enabled: true });
    expect(shouldPlanJordanReel({
      now,
      timezone: 'America/Toronto',
      config,
      existingAssets: [],
    })).toBe(true);
    const slot = jordanReelSlotKey(now, 'America/Toronto');
    expect(shouldPlanJordanReel({
      now,
      timezone: 'America/Toronto',
      config,
      existingAssets: [asset({ metadata: { reel_slot_key: slot } })],
    })).toBe(false);
  });

  it('replaces a review-failed Reel without overwriting its evidence', () => {
    const now = new Date('2026-07-26T14:00:00.000Z');
    const slot = jordanReelSlotKey(now, 'America/Toronto');
    const config = resolveJordanReelConfig({ reels_enabled: true });
    expect(shouldPlanJordanReel({
      now,
      timezone: 'America/Toronto',
      config,
      coverageRequired: true,
      existingAssets: [asset({
        status: 'review',
        metadata: { reel_slot_key: slot, reel_render_status: 'review_failed' },
      })],
    })).toBe(true);
    expect(jordanReelAttemptKey(slot, 1)).toBe(`jordan-reel-${slot}-r1`);
    expect(jordanReelAttemptKey(slot, 2)).toBe(`jordan-reel-${slot}-r2`);
  });

  it('bounds review-failure recovery at three immutable attempts per slot', () => {
    const now = new Date('2026-07-26T14:00:00.000Z');
    const slot = jordanReelSlotKey(now, 'America/Toronto');
    const config = resolveJordanReelConfig({ reels_enabled: true });
    expect(shouldPlanJordanReel({
      now,
      timezone: 'America/Toronto',
      config,
      coverageRequired: true,
      existingAssets: [0, 1, 2].map((attempt) => asset({
        asset_id: `failed-${attempt}`,
        status: 'review',
        metadata: { reel_slot_key: slot, reel_render_status: 'review_failed' },
      })),
    })).toBe(false);
  });

  it('catches up stale Reel inventory off-schedule but still enforces the weekly cap', () => {
    const config = resolveJordanReelConfig({
      reels_enabled: true,
      reels_per_week: 1,
      reel_days_local: [0, 2],
    });
    expect(shouldPlanJordanReel({
      now: new Date('2026-07-27T14:00:00.000Z'),
      timezone: 'America/Toronto',
      config,
      existingAssets: [],
    })).toBe(true);
    expect(shouldPlanJordanReel({
      now: new Date('2026-07-26T14:00:00.000Z'),
      timezone: 'America/Toronto',
      config,
      existingAssets: [asset({
        created_at: '2026-07-25T14:00:00.000Z',
        metadata: { reel_slot_key: '2026-07-25-d6' },
      })],
    })).toBe(false);
  });

  it('does not let failed review attempts consume weekly or recent Reel coverage', () => {
    const config = resolveJordanReelConfig({
      reels_enabled: true,
      reels_per_week: 1,
      reel_days_local: [0],
    });
    expect(shouldPlanJordanReel({
      now: new Date('2026-07-27T14:00:00.000Z'),
      timezone: 'America/Toronto',
      config,
      existingAssets: [asset({
        created_at: '2026-07-26T14:00:00.000Z',
        status: 'review',
        metadata: {
          reel_slot_key: '2026-07-26-d0',
          reel_render_status: 'review_failed',
        },
      })],
    })).toBe(true);
  });

  it('keeps normal weekday scheduling when Reel inventory is recent', () => {
    const config = resolveJordanReelConfig({
      reels_enabled: true,
      reel_days_local: [0, 2],
    });
    expect(shouldPlanJordanReel({
      now: new Date('2026-07-27T14:00:00.000Z'),
      timezone: 'America/Toronto',
      config,
      existingAssets: [asset({
        created_at: '2026-07-20T14:00:00.000Z',
        metadata: { reel_slot_key: '2026-07-20-d1' },
      })],
    })).toBe(false);
    expect(shouldPlanJordanReel({
      now: new Date('2026-07-27T14:00:00.000Z'),
      timezone: 'America/Toronto',
      config,
      coverageRequired: true,
      existingAssets: [asset({
        created_at: '2026-07-20T14:00:00.000Z',
        metadata: { reel_slot_key: '2026-07-20-d1' },
      })],
    })).toBe(true);
  });

  it('requires a grounded source and produces bounded crop-safe template copy', () => {
    expect(chooseJordanReelSource([source], ['timely'])).toEqual(source);
    expect(chooseJordanReelSource([
      { ...source, evidence: { ...source.evidence, source_url: 'not-a-url' } },
    ], ['timely'])).toBeNull();
    const script = buildJordanReelScript(source);
    expect(script.template).toBe('diagnostic-kinetic-v1');
    expect(script.sourceUrl).toMatch(/^https:\/\//);
    expect(script.hook.length).toBeLessThanOrEqual(72);
    expect(script.tension.length).toBeLessThanOrEqual(100);
    expect(script.url).toBe('getgeopulse.com');
  });

  it('rotates away from a previously rendered script instead of repeating its media', () => {
    const alternate = {
      ...source,
      key: 'sofia-service-proof',
      title: 'Show the service evidence before the promise',
      evidence: {
        ...source.evidence,
        hook: 'Lead with the service evidence an MSP buyer can verify.',
        original_angle: 'Make the offer, service area, proof, and next action agree.',
      },
    };
    const existing = asset({
      metadata: { reel_script: buildJordanReelScript(source) },
    });

    expect(chooseJordanReelSource([source, alternate], ['timely'], [existing]))
      .toEqual(alternate);
    expect(chooseJordanReelSource([source], ['timely'], [existing])).toBeNull();
  });

  it('prefers an unused primary-campaign source before a challenger source', () => {
    const challenger = {
      ...source,
      key: 'agency-challenger',
      evidence: {
        ...source.evidence,
        source_url: 'https://developers.google.com/search/docs/agency-example',
        campaign_role: 'challenger',
      },
    };
    const primary = {
      ...source,
      key: 'msp-primary',
      evidence: {
        ...source.evidence,
        source_url: 'https://developers.google.com/search/docs/msp-example',
        campaign_role: 'primary',
      },
    };

    expect(chooseJordanReelSource([challenger, primary], ['timely'])).toEqual(primary);
  });

  it('never truncates a Reel line in the middle of a word', () => {
    const script = buildJordanReelScript({
      ...source,
      evidence: {
        ...source.evidence,
        hook: 'The next SEO brief may include actions, not just rankings.',
        original_angle: 'Create slides covering plain-language entity definition, audience, use cases, service area, proof, limitations, and next action.',
      },
    });
    expect(script.hook).toBe('The next SEO brief may include actions, not just rankings');
    expect(script.tension).not.toMatch(/\s[a-z]$/);
  });

  // Regression: the exact copy that published seven times in August 2026. The caption is
  // thirteen words and the old builder capped `tension` at twelve, silently amputating
  // "fix." and leaving the line hanging on a preposition.
  it('never ends a Reel line on a dangling word', () => {
    const script = buildJordanReelScript({
      ...source,
      title: 'What an AI-readiness audit actually shows',
      caption: 'An AI-visibility score is only useful when it tells you what to fix.',
      evidence: {
        source_url: 'https://getgeopulse.com/methodology/ai-search-readiness-audit',
        source_label: 'GEO-Pulse product behavior',
      },
    });
    expect(script.tension).not.toMatch(/\bto$/);
    for (const line of [script.hook, script.tension, script.diagnostic]) {
      expect(line).not.toMatch(
        /\b(?:to|the|a|an|of|for|when|what|and|or|with|that|your|it|is|not|just)$/i
      );
    }
  });

  it('does not restate the hook as the diagnostic payoff', () => {
    const script = buildJordanReelScript({
      ...source,
      title: 'What an AI-readiness audit actually shows',
      caption: 'An AI-visibility score is only useful when it tells you what to fix.',
      evidence: {
        source_url: 'https://getgeopulse.com/methodology/ai-search-readiness-audit',
        source_label: 'GEO-Pulse product behavior',
      },
    });
    const normalise = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
    expect(normalise(script.diagnostic)).not.toBe(normalise(script.hook));
    expect(normalise(script.tension)).not.toBe(normalise(script.hook));
  });

  it('never renders a comparison whose halves are not a contrast', () => {
    const withoutContrast = buildJordanReelScript(source);
    expect(withoutContrast.comparisonTop).not.toBe(withoutContrast.comparisonBottom);
    // 'AI READY' used to be hardcoded as the bottom half of every Reel ever produced,
    // paired against a truncated fragment of the title.
    expect(withoutContrast.comparisonTop).not.toMatch(/^WHAT AN /);

    const withContrast = buildJordanReelScript({
      ...source,
      evidence: {
        ...source.evidence,
        comparison_top: 'Ranks #1',
        comparison_bottom: 'Absent from AI',
      },
    });
    expect(withContrast.comparisonTop).toBe('RANKS #1');
    expect(withContrast.comparisonBottom).toBe('ABSENT FROM AI');
  });

});
