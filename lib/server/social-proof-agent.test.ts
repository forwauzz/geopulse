import { describe, expect, it } from 'vitest';
import {
  buildAggregateCandidate,
  buildBeforeAfterCandidate,
  buildEducationalCandidate,
  buildIndustryHumorCandidate,
  instagramScheduleSlot,
  resolveSocialProofAgentConfig,
} from './social-proof-agent';

function scan(overrides: Record<string, unknown> = {}) {
  return {
    id: 'scan-1',
    domain: 'example.com',
    score: 40,
    letter_grade: 'D',
    issues_json: [{ check: 'Organization schema', passed: false }],
    run_source: 'public',
    created_at: '2026-07-20T00:00:00.000Z',
    ...overrides,
  };
}

describe('Social Proof Agent safeguards', () => {
  it('is fail-closed when disabled or killed', () => {
    expect(resolveSocialProofAgentConfig({}, false, false).mode).toBe('off');
    expect(resolveSocialProofAgentConfig({ mode: 'autonomous' }, true, true).mode).toBe('off');
  });

  it('only creates before-and-after proof for the owned domain and a real improvement', () => {
    const candidate = buildBeforeAfterCandidate(
      [
        scan({ id: 'old', domain: 'getgeopulse.com', score: 61, created_at: '2026-07-01T00:00:00Z' }),
        scan({ id: 'new', domain: 'getgeopulse.com', score: 78, created_at: '2026-07-20T00:00:00Z' }),
        scan({ id: 'client', domain: 'alie.app', score: 99, created_at: '2026-07-21T00:00:00Z' }),
      ],
      'https://getgeopulse.com'
    );

    expect(candidate?.evidence).toMatchObject({ domain: 'getgeopulse.com', delta: 17 });
    expect(candidate?.caption).toContain('not a ranking or traffic guarantee');
    expect(candidate?.safeForAutonomousPublish).toBe(false);
  });

  it('requires a minimum anonymous sample and excludes internal benchmarks', () => {
    const scans = [
      scan({ id: 'one' }),
      scan({ id: 'two', domain: 'two.example' }),
      scan({ id: 'benchmark', run_source: 'internal_benchmark' }),
    ];

    expect(buildAggregateCandidate(scans, 'https://getgeopulse.com', 3)).toBeNull();
    const candidate = buildAggregateCandidate(scans, 'https://getgeopulse.com', 2);
    expect(candidate?.evidence).toMatchObject({ sample_size: 2, anonymized: true });
    expect(candidate?.caption).toContain('not an industry benchmark');
  });

  it('requires a verified absolute hero before autonomous educational distribution', () => {
    const base = {
      id: 'article-1',
      title: 'How to improve AI visibility',
      slug: 'improve-ai-visibility',
      canonical_url: null,
      published_at: '2026-07-20T00:00:00Z',
    };
    expect(buildEducationalCandidate({ ...base, metadata: {} }, 'https://getgeopulse.com')).toBeNull();

    const candidate = buildEducationalCandidate(
      {
        ...base,
        metadata: {
          hero_image_url: 'https://getgeopulse.com/media/hero.jpg',
          hero_image_alt: 'Clean diagram of an AI visibility workflow',
        },
      },
      'https://getgeopulse.com'
    );
    expect(candidate?.safeForAutonomousPublish).toBe(true);
    expect(candidate?.mediaAlt).toContain('AI visibility');
  });

  it('normalizes relative canonical URLs before adding provider tracking', () => {
    const candidate = buildEducationalCandidate(
      {
        id: 'article-relative',
        title: 'Relative canonical article',
        slug: 'relative-canonical',
        canonical_url: '/blog/relative-canonical',
        published_at: '2026-07-20T00:00:00Z',
        metadata: {
          hero_image_url: 'https://getgeopulse.com/media/relative.jpg',
          hero_image_alt: 'Diagram for the relative canonical article',
        },
      },
      'https://getgeopulse.com/'
    );

    expect(candidate?.ctaUrl).toBe('https://getgeopulse.com/blog/relative-canonical');
    expect(candidate?.safeForAutonomousPublish).toBe(true);
  });

  it('keeps client proof disabled by default even when draft generation is enabled', () => {
    const config = resolveSocialProofAgentConfig({ mode: 'draft' }, true, false);
    expect(config.clientProofEnabled).toBe(false);
    expect(config.auditScreenshotsEnabled).toBe(false);
    expect(config.reelsEnabled).toBe(false);
    expect(config.industryHumorEnabled).toBe(true);
  });

  it('creates claim-safe agency humor from a verified article hero', () => {
    const candidate = buildIndustryHumorCandidate(
      {
        id: 'article-1',
        title: 'Why search rank is not AI visibility',
        slug: 'search-vs-ai',
        canonical_url: 'https://getgeopulse.com/blog/search-vs-ai',
        published_at: '2026-07-20T00:00:00Z',
        metadata: {
          hero_image_url: 'https://getgeopulse.com/media/hero.jpg',
          hero_image_alt: 'Search and AI visibility diagram',
        },
      },
      'https://getgeopulse.com'
    );
    expect(candidate?.kind).toBe('industry_humor');
    expect(candidate?.safeForAutonomousPublish).toBe(true);
    expect(candidate?.caption).toContain('not the same system');
  });

  it('schedules Toronto posts at the local half-hour and sends a missed slot promptly', () => {
    expect(
      instagramScheduleSlot(
        new Date('2026-07-23T13:00:00.000Z'),
        'America/Toronto',
        17
      )
    ).toBe('2026-07-23T21:30:00.000Z');
    expect(
      instagramScheduleSlot(
        new Date('2026-07-23T14:00:00.000Z'),
        'America/Toronto',
        9
      )
    ).toBe('2026-07-23T14:02:00.000Z');
  });
});
