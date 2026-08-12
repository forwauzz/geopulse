import { describe, expect, it } from 'vitest';
import {
  buildJordanReelScript,
  chooseJordanReelSource,
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
});
