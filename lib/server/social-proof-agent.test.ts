import { describe, expect, it } from 'vitest';
import {
  buildAggregateCandidate,
  buildBeforeAfterCandidate,
  buildEducationalCandidate,
  buildIndustryHumorCandidate,
  buildProductDemoCandidate,
  assignedSocialCandidate,
  assignedSocialCandidates,
  filterCampaignAssignedSocial,
  growthCampaignForSocialCandidate,
  instagramScheduleSlot,
  latestSocialSequenceAnchor,
  nextLocalAssetCapacityReset,
  orderAutonomousCandidates,
  preferredAccount,
  prioritizeRequiredFormatCandidates,
  remainingDailyAssetCapacity,
  reelProductionDeferral,
  reserveInstagramCadenceSlot,
  reserveInstagramScheduleSlot,
  resolveSocialProofAgentConfig,
  socialSequenceDimensions,
  socialSequenceMetadata,
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
  it('versions assigned carousel inventory and supplies a real multi-slide checklist', () => {
    const candidate = assignedSocialCandidate({
      id: 'item-1',
      content_id: 'content-1',
      title: 'What MSP buyers ask AI search',
      brief_markdown: null,
      metadata: {
        source_url: 'https://example.com/source',
        recommendation: 'Answer the buyer question directly.',
        evidence: 'The source documents the question.',
        campaign_vertical: 'msp_it_services',
      },
      created_at: '2026-08-17T00:00:00.000Z',
      growth_campaign_id: 'msp-1',
      growth_intervention_id: null,
    }, 'https://getgeopulse.com');
    expect(candidate).toMatchObject({
      key: 'assigned-carousel-v2-content-1',
      assetType: 'carousel_post',
      evidence: { checklist_items: expect.any(Array) },
    });
    expect(candidate?.evidence['checklist_items']).toHaveLength(4);
  });

  it('keeps source-backed assigned carousel inventory non-duplicative after the first version', () => {
    const candidates = assignedSocialCandidates({
      id: 'item-1',
      content_id: 'content-1',
      title: 'What MSP buyers ask AI search',
      brief_markdown: null,
      metadata: {
        source_url: 'https://example.com/source',
        source_label: 'First-party MSP source',
        recommendation: 'Put the direct answer beside the service proof.',
        evidence: 'The source documents the buyer question and the current evidence gap.',
        campaign_vertical: 'msp_it_services',
      },
      created_at: '2026-08-17T00:00:00.000Z',
      growth_campaign_id: 'msp-1',
      growth_intervention_id: null,
    }, 'https://getgeopulse.com');

    expect(candidates).toHaveLength(3);
    expect(new Set(candidates.map((candidate) => candidate.key)).size).toBe(3);
    expect(new Set(candidates.map((candidate) =>
      JSON.stringify(candidate.evidence['checklist_items'])
    )).size).toBe(3);
    expect(candidates.every((candidate) => candidate.assetType === 'carousel_post')).toBe(true);
    expect(candidates.every((candidate) => candidate.evidence['source_url'] === 'https://example.com/source')).toBe(true);
  });

  it('puts a missing connected format ahead of covered candidates without changing the cap', () => {
    const candidate = (
      key: string,
      assetType: 'single_image_post' | 'carousel_post',
    ) => ({
      key,
      kind: assetType === 'carousel_post' ? 'carousel' as const : 'educational' as const,
      title: key,
      caption: key,
      ctaUrl: 'https://getgeopulse.com',
      contentItemId: null,
      mediaUrl: null,
      mediaMimeType: null,
      mediaAlt: null,
      assetType,
      evidence: {},
      safeForAutonomousPublish: true,
    });
    const ordered = prioritizeRequiredFormatCandidates([
      candidate('covered-one', 'single_image_post'),
      candidate('needed-carousel', 'carousel_post'),
      candidate('covered-two', 'single_image_post'),
    ], ['instagram:carousel_post']);

    expect(ordered.map((item) => item.key)).toEqual([
      'needed-carousel',
      'covered-one',
      'covered-two',
    ]);
    expect(ordered).toHaveLength(3);
  });

  it('surfaces an exhausted exact-media review ahead of a generic daily-cap deferral', () => {
    const deferral = reelProductionDeferral([{
      asset_type: 'short_video_post',
      metadata: {
        reel_render_status: 'review_failed',
        reel_review_status: 'hold',
        reel_render_retryable: true,
        reel_render_attempt_count: 3,
        reel_review_retry_after: '2026-08-27T01:25:49.476Z',
      },
    } as never], ['instagram:short_video_post'], false);

    expect(deferral).toEqual({ reason: 'reel_review_attempts_exhausted' });
  });

  it('keeps a bounded exact-media review backoff owned until its due time', () => {
    const deferral = reelProductionDeferral([{
      asset_type: 'short_video_post',
      metadata: {
        reel_render_status: 'review_failed',
        reel_review_status: 'hold',
        reel_render_retryable: true,
        reel_render_attempt_count: 2,
        reel_review_retry_after: '2026-08-27T01:25:49.476Z',
      },
    } as never], ['instagram:short_video_post'], false);

    expect(deferral).toEqual({
      reason: 'reel_review_retry_pending',
      retryAfter: '2026-08-27T01:25:49.476Z',
    });
  });

  it('keeps a first-party grounded Reel source when trend providers are unavailable', () => {
    const candidate = buildProductDemoCandidate('https://getgeopulse.com/');
    expect(candidate.evidence).toMatchObject({
      source_url: 'https://getgeopulse.com/methodology/ai-search-readiness-audit',
      source_type: 'first_party_methodology',
      product_truth: true,
      claim_boundary: 'observable_readiness_signals_no_ranking_guarantee',
    });
  });

  it('keeps autonomous social candidates inside the active vertical campaigns', () => {
    const items = [
      { id: 'msp', metadata: { growth_campaign_id: 'msp-1', campaign_vertical: 'msp_it_services' } },
      { id: 'agency', metadata: { campaign_id: 'agency-1', vertical: 'marketing_agencies' } },
      { id: 'generic', metadata: { campaign_id: 'generic', vertical: 'small_business' } },
      { id: 'untagged', metadata: {} },
    ];
    expect(filterCampaignAssignedSocial(items).map((item) => item.id)).toEqual(['msp', 'agency']);
  });

  it('refuses to stamp an active campaign onto content from another vertical', () => {
    const campaigns = [
      {
        id: 'msp-1',
        campaign_key: 'quebec-msp',
        role: 'primary' as const,
        status: 'active' as const,
        vertical: 'msp_it_services' as const,
        subvertical: null,
        geo_region: 'Quebec',
        buyer_role: 'MSP owner',
        primary_problem: 'Buyer proof',
        offer_key: 'free_scan',
        cta_goal: 'scan',
        allocation_percent: 80,
        success_condition: 'qualified scan',
        stop_condition: 'three placements without action',
      },
      {
        id: 'agency-1',
        campaign_key: 'agency-challenger',
        role: 'challenger' as const,
        status: 'active' as const,
        vertical: 'marketing_agencies' as const,
        subvertical: null,
        geo_region: 'Quebec',
        buyer_role: 'Agency owner',
        primary_problem: 'Client reporting',
        offer_key: 'free_scan',
        cta_goal: 'scan',
        allocation_percent: 20,
        success_condition: 'qualified scan',
        stop_condition: 'three placements without action',
      },
    ];

    expect(growthCampaignForSocialCandidate({
      title: 'AI-Search Readiness for Legal and Professional Services',
      caption: 'A practical guide for law firms and professional-services buyers.',
      evidence: {},
    }, campaigns)).toBeNull();

    expect(growthCampaignForSocialCandidate({
      title: 'What MSP buyers need to verify',
      caption: 'Managed service providers should put the proof beside the promise.',
      evidence: {},
    }, campaigns)?.id).toBe('msp-1');

    expect(growthCampaignForSocialCandidate({
      title: 'What MSP buyers need to verify',
      caption: 'Managed service providers should put the proof beside the promise.',
      evidence: {
        growth_campaign_id: 'agency-1',
        campaign_vertical: 'msp_it_services',
      },
    }, campaigns)).toBeNull();
  });

  it('prefers a social account over connected newsletter accounts', () => {
    const account = (provider_name: 'buttondown' | 'instagram', id: string) => ({
      id,
      account_id: id,
      provider_name,
      account_label: id,
      external_account_id: null,
      status: 'connected' as const,
      default_audience_id: null,
      metadata: {},
      connected_by_user_id: null,
      last_verified_at: null,
      created_at: '2026-07-26T00:00:00.000Z',
      updated_at: '2026-07-26T00:00:00.000Z',
    });
    expect(preferredAccount([
      account('buttondown', 'newsletter'),
      account('instagram', 'social'),
    ])?.provider_name).toBe('instagram');
  });

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
    expect(candidate?.safeForAutonomousPublish).toBe(true);
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
      source_links: ['https://developers.google.com/search/docs/appearance/ai-features'],
      growth_campaign_id: 'msp-1',
      published_at: '2026-07-20T00:00:00Z',
    };
    expect(buildEducationalCandidate({ ...base, metadata: {} }, 'https://getgeopulse.com')).toBeNull();

    const candidate = buildEducationalCandidate(
      {
        ...base,
        metadata: {
          hero_image_url: 'https://getgeopulse.com/media/hero.jpg',
          hero_image_alt: 'Clean diagram of an AI visibility workflow',
          campaign_key: 'msp-qc-first-customer-2026q3',
          campaign_role: 'primary',
          campaign_vertical: 'msp_it_services',
        },
      },
      'https://getgeopulse.com'
    );
    expect(candidate?.safeForAutonomousPublish).toBe(true);
    expect(candidate?.mediaAlt).toContain('AI visibility');
    expect(candidate?.evidence).toMatchObject({
      source_url: 'https://developers.google.com/search/docs/appearance/ai-features',
      source_label: 'developers.google.com',
      source_type: 'published_article_source',
      growth_campaign_id: 'msp-1',
      campaign_key: 'msp-qc-first-customer-2026q3',
      campaign_role: 'primary',
      campaign_vertical: 'msp_it_services',
    });
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
    expect(config.reelsEnabled).toBe(true);
    expect(config.reelsPerWeek).toBe(4);
    expect(config.reelDaysLocal).toEqual([0, 2, 4, 6]);
    expect(config.reelPublishMode).toBe('autonomous');
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

  it('alternates formats without reusing the same media in one cadence', () => {
    const candidate = (input: {
      key: string;
      kind: 'educational' | 'industry_humor';
      contentItemId: string;
      mediaUrl: string;
    }) => ({
      ...input,
      title: input.key,
      caption: input.key,
      ctaUrl: 'https://getgeopulse.com',
      mediaMimeType: 'image/jpeg',
      mediaAlt: 'Editorial evidence collage',
      evidence: {},
      safeForAutonomousPublish: true,
    });
    const educationalOne = candidate({
      key: 'educational-one',
      kind: 'educational',
      contentItemId: 'one',
      mediaUrl: 'https://media.example.com/one.jpg',
    });
    const humorOne = candidate({
      key: 'humor-one',
      kind: 'industry_humor',
      contentItemId: 'one',
      mediaUrl: 'https://media.example.com/one.jpg',
    });
    const educationalTwo = candidate({
      key: 'educational-two',
      kind: 'educational',
      contentItemId: 'two',
      mediaUrl: 'https://media.example.com/two.jpg',
    });
    const humorTwo = candidate({
      key: 'humor-two',
      kind: 'industry_humor',
      contentItemId: 'two',
      mediaUrl: 'https://media.example.com/two.jpg',
    });

    const ordered = orderAutonomousCandidates([
      educationalOne,
      educationalTwo,
      humorOne,
      humorTwo,
    ]);

    expect(ordered.slice(0, 2).map((item) => item.key)).toEqual([
      'humor-one',
      'educational-two',
    ]);
    expect(new Set(ordered.map((item) => item.mediaUrl)).size).toBe(ordered.length);
    expect(ordered.some((item) => item.key === 'educational-one')).toBe(false);
  });

  it('continues the editorial flow from the previous autonomous run', () => {
    const candidate = (
      key: string,
      kind: 'educational' | 'industry_humor' | 'carousel',
      assetType: 'single_image_post' | 'carousel_post',
    ) => ({
      key,
      kind,
      title: key,
      caption: key,
      ctaUrl: 'https://getgeopulse.com',
      contentItemId: null,
      mediaUrl: null,
      mediaMimeType: null,
      mediaAlt: null,
      assetType,
      evidence: {},
      safeForAutonomousPublish: true,
    });
    const previous = {
      narrativeKind: 'carousel' as const,
      assetType: 'carousel_post' as const,
      visualFamily: 'carousel' as const,
    };

    const ordered = orderAutonomousCandidates([
      candidate('carousel-next', 'carousel', 'carousel_post'),
      candidate('education-next', 'educational', 'single_image_post'),
      candidate('humor-next', 'industry_humor', 'single_image_post'),
    ], new Map(), previous);

    expect(ordered[0]).toMatchObject({
      key: 'humor-next',
      kind: 'industry_humor',
      assetType: 'single_image_post',
    });
    expect(ordered[1]?.kind).not.toBe(ordered[0]?.kind);
  });

  it('recovers the last Jordan sequence anchor and ignores failed drafts', () => {
    const asset = (
      createdAt: string,
      kind: 'carousel' | 'industry_humor',
      status: 'approved' | 'failed',
      assetType: 'carousel_post' | 'single_image_post',
    ) => ({
      id: createdAt,
      asset_id: createdAt,
      content_item_id: null,
      source_type: 'manual' as const,
      source_key: createdAt,
      asset_type: assetType,
      provider_family: 'instagram' as const,
      title: createdAt,
      body_markdown: null,
      body_plaintext: null,
      caption_text: null,
      status,
      cta_url: null,
      metadata: {
        created_by_agent: 'jordan',
        proof_kind: kind,
        content_sequence: { visual_family: kind === 'carousel' ? 'carousel' : 'humor' },
      },
      created_by_user_id: null,
      approved_by_user_id: null,
      approved_at: null,
      created_at: createdAt,
      updated_at: createdAt,
    });

    expect(latestSocialSequenceAnchor([
      asset('2026-08-18T02:00:00.000Z', 'industry_humor', 'failed', 'single_image_post'),
      asset('2026-08-18T01:00:00.000Z', 'carousel', 'approved', 'carousel_post'),
    ])).toEqual({
      narrativeKind: 'carousel',
      assetType: 'carousel_post',
      visualFamily: 'carousel',
    });
  });

  it('records auditable narrative, format, and visual sequence dimensions', () => {
    const candidate = {
      key: 'proof-reel',
      kind: 'proof_demo',
      title: 'Proof Reel',
      caption: 'Proof Reel',
      ctaUrl: 'https://getgeopulse.com',
      contentItemId: null,
      mediaUrl: null,
      mediaMimeType: null,
      mediaAlt: null,
      assetType: 'short_video_post',
      evidence: {},
      safeForAutonomousPublish: false,
    } as const;
    expect(socialSequenceDimensions(candidate)).toEqual({
      version: 'social-flow-v1',
      narrativeKind: 'proof_demo',
      assetType: 'short_video_post',
      visualFamily: 'proof',
    });
    expect(socialSequenceMetadata(candidate, {
      narrativeKind: 'carousel',
      assetType: 'carousel_post',
      visualFamily: 'carousel',
    }, 2)).toEqual({
      version: 'social-flow-v1',
      narrative_kind: 'proof_demo',
      asset_format: 'short_video_post',
      visual_family: 'proof',
      previous_narrative_kind: 'carousel',
      previous_asset_format: 'carousel_post',
      previous_visual_family: 'carousel',
      run_position: 2,
    });
  });

  it('schedules Toronto posts on an hourly dispatch boundary without bunching missed slots', () => {
    expect(
      instagramScheduleSlot(
        new Date('2026-07-23T13:00:00.000Z'),
        'America/Toronto',
        17
      )
    ).toBe('2026-07-23T21:00:00.000Z');
    expect(
      instagramScheduleSlot(
        new Date('2026-07-23T14:00:00.000Z'),
        'America/Toronto',
        9
      )
    ).toBe('2026-07-24T13:00:00.000Z');
    expect(
      instagramScheduleSlot(
        new Date('2026-07-23T14:12:34.567Z'),
        'America/Toronto',
        17
      )
    ).toBe('2026-07-23T21:00:00.000Z');
  });

  it('reserves the next open hourly slot when another post already owns the desired hour', () => {
    const occupied = new Set(['2026-07-23T21:00:00.000Z']);
    expect(
      reserveInstagramScheduleSlot('2026-07-23T21:00:00.000Z', occupied)
    ).toBe('2026-07-23T22:00:00.000Z');
    expect(
      reserveInstagramScheduleSlot('2026-07-23T21:00:00.000Z', occupied)
    ).toBe('2026-07-23T23:00:00.000Z');
  });

  it('spaces recovery inventory across open cadence days instead of burst-posting', () => {
    const occupied = new Set([
      '2026-08-24T17:00:00.000Z',
      '2026-08-26T17:00:00.000Z',
      '2026-08-28T17:00:00.000Z',
    ]);

    expect(
      reserveInstagramCadenceSlot('2026-08-24T13:00:00.000Z', occupied),
    ).toBe('2026-08-25T13:00:00.000Z');
    expect(
      reserveInstagramCadenceSlot('2026-08-24T16:00:00.000Z', occupied),
    ).toBe('2026-08-27T16:00:00.000Z');
    expect(
      reserveInstagramCadenceSlot('2026-08-24T19:00:00.000Z', occupied),
    ).toBe('2026-08-29T19:00:00.000Z');
  });

  it('enforces the creative cap across the configured local day instead of once per hourly run', () => {
    const asset = (created_at: string, createdBy = 'jordan') => ({
      id: created_at,
      asset_id: created_at,
      campaign_id: 'social-proof',
      content_item_id: null,
      asset_type: 'carousel_post' as const,
      title: 'Test asset',
      body_text: 'Test',
      media_url: null,
      media_mime_type: null,
      media_alt: null,
      cta_url: null,
      utm: {},
      metadata: { created_by_agent: createdBy },
      status: 'ready' as const,
      created_at,
      updated_at: created_at,
    });

    expect(remainingDailyAssetCapacity([
      asset('2026-07-27T05:00:00.000Z'),
      asset('2026-07-27T06:00:00.000Z'),
      asset('2026-07-27T07:00:00.000Z', 'manual'),
      asset('2026-07-27T03:00:00.000Z'),
    ], new Date('2026-07-27T08:00:00.000Z'), 4, 'America/Toronto')).toBe(2);

    expect(remainingDailyAssetCapacity([
      asset('2026-07-27T01:00:00.000Z'),
      asset('2026-07-27T05:00:00.000Z'),
    ], new Date('2026-07-27T03:30:00.000Z'), 4, 'America/Toronto')).toBe(3);
  });

  it('defers a saturated Toronto creative day to the next local reset', () => {
    expect(nextLocalAssetCapacityReset(
      new Date('2026-08-26T00:05:00.000Z'),
      'America/Toronto',
    )).toBe('2026-08-26T04:00:00.000Z');
  });
});
