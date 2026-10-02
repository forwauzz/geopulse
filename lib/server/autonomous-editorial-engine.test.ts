import { describe, expect, it, vi } from 'vitest';
import {
  AUTONOMOUS_EDITORIAL_SOURCE_TYPE,
  EDITORIAL_FALLBACK_SCAN_LIMIT,
  editorialDraftTopic,
  ensureEditorialInternalBlogLink,
  findPublishedEditorialDuplicate,
  mergeEditorialCandidates,
  removeRedundantEditorialH1,
  runAutonomousEditorialEngine,
  selectEditorialCandidateForActiveCampaign,
} from './autonomous-editorial-engine';
import type { GrowthCampaign } from './growth-campaign-intelligence';

const primaryCampaign: GrowthCampaign = {
  id: 'campaign-primary',
  campaign_key: 'msp-primary',
  role: 'primary',
  status: 'active',
  vertical: 'msp_it_services',
  subvertical: null,
  geo_region: 'Quebec',
  buyer_role: 'MSP owner',
  primary_problem: 'AI-search evidence gaps',
  offer_key: 'free_scan',
  cta_goal: 'free_scan',
  allocation_percent: 80,
  success_condition: 'qualified reply',
  stop_condition: 'three zero-action placements',
};
const challengerCampaign: GrowthCampaign = {
  ...primaryCampaign,
  id: 'campaign-challenger',
  campaign_key: 'agency-challenger',
  role: 'challenger',
  vertical: 'marketing_agencies',
  buyer_role: 'Agency owner',
  allocation_percent: 20,
};
const row = { content_id: 'content-1', slug: 'useful-page', content_type: 'article', title: 'MSP brief', topic_cluster: 'msp_ai_search_readiness', status: 'brief', growth_campaign_id: 'campaign-primary', metadata: { campaign_vertical: 'msp_it_services' } };
function db(candidate = row) {
  const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
  return { update, from: vi.fn((table: string) => ({
    select: vi.fn((columns: string) => {
      if (table === 'automation_settings') {
        return { eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { feature:'marketing_autopilot', enabled:true, kill_switch:false, config:{} }, error:null })) })) };
      }
      if (table === 'agent_work_loops') {
        return { eq: vi.fn(() => ({ in: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [] })) })) })) };
      }
      if (table === 'growth_campaigns') {
        return { eq: vi.fn(async () => ({ data: [primaryCampaign, challengerCampaign], error: null })) };
      }
      if (columns === 'id') {
        const chain: any = {};
        chain.eq = vi.fn(() => chain);
        chain.gte = vi.fn(() => chain);
        chain.limit = vi.fn(async () => ({ data: [] }));
        return chain;
      }
      if (columns === 'content_id,title,draft_markdown') {
        const chain: any = {};
        chain.eq = vi.fn(() => chain);
        chain.limit = vi.fn(async () => ({ data: [{ content_id:'existing', title:'Existing', draft_markdown:'Existing answer.' }], error:null }));
        return chain;
      }
      const chain: any = {};
      chain.eq = vi.fn(() => chain);
      chain.in = vi.fn(() => chain);
      chain.order = vi.fn(() => chain);
      chain.limit = vi.fn(async () => ({ data:[candidate], error:null }));
      return chain;
    }),
    update,
  })) } as any;
}

describe('autonomous editorial engine', () => {
  it('removes a generated H1 only when the page title already supplies the same title', () => {
    expect(removeRedundantEditorialH1('# AI Visibility Audit\n\nUseful lead.', 'AI Visibility Audit')).toBe(
      'Useful lead.'
    );
    expect(removeRedundantEditorialH1('# Different claim\n\nUseful lead.', 'AI Visibility Audit')).toContain(
      '# Different claim'
    );
  });
  it('uses a source type permitted by the production content_items contract', () => {
    expect(['internal_product', 'external_research', 'internal_plus_research', 'founder_input'])
      .toContain(AUTONOMOUS_EDITORIAL_SOURCE_TYPE);
  });
  it('adds the verified readiness guide when a provider omits internal links', () => {
    const markdown = ensureEditorialInternalBlogLink('# Useful answer\n\n## What to do\n\nStart with observable evidence.');

    expect(markdown).toContain(
      '[an AI-search readiness audit](/blog/ai-search-readiness-audit)'
    );
    expect(ensureEditorialInternalBlogLink(markdown)).toBe(markdown);
  });

  it('detects an exact published title or lead before a second public article is created', () => {
    const published = [{
      content_id: 'published-1',
      title: 'AI-Search Readiness for MSPs: Measuring Observable Website Signals',
      draft_markdown: 'A distinct published lead that is long enough to compare without matching boilerplate.',
    }];
    expect(findPublishedEditorialDuplicate({
      title: 'AI Search Readiness for MSPs — Measuring Observable Website Signals',
      markdown: 'A new body.',
    }, published)).toMatchObject({ contentId: 'published-1', reason: 'duplicate_title' });

    const repeatedLead = 'To determine if AI answers understand and recommend their services, MSPs should focus on measuring observable website signals, including crawler access, answer clarity, and repeatable measurement. This bounded lead is intentionally long enough for deterministic comparison.';
    expect(findPublishedEditorialDuplicate({
      title: 'A different title',
      markdown: `${repeatedLead}\n\n## New section\n\nDifferent details.`,
    }, [{ content_id: 'published-2', title: 'Original title', draft_markdown: `${repeatedLead}\n\n## Earlier section\n\nEarlier details.` }])).toMatchObject({ contentId: 'published-2', reason: 'duplicate_lead' });
  });

  it('quarantines a deterministic duplicate before hero spend or review', async () => {
    const supabase = db();
    supabase.from = vi.fn((table: string) => ({
      select: vi.fn((columns: string) => {
        if (table === 'automation_settings') {
          return { eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { feature:'marketing_autopilot', enabled:true, kill_switch:false, config:{} }, error:null })) })) };
        }
        if (table === 'agent_work_loops') {
          return { eq: vi.fn(() => ({ in: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [] })) })) })) };
        }
        if (table === 'growth_campaigns') {
          return { eq: vi.fn(async () => ({ data: [primaryCampaign, challengerCampaign], error: null })) };
        }
        if (columns === 'id') {
          const chain: any = {};
          chain.eq = vi.fn(() => chain); chain.gte = vi.fn(() => chain); chain.limit = vi.fn(async () => ({ data: [] }));
          return chain;
        }
        if (columns === 'content_id,title,draft_markdown') {
          const chain: any = {};
          chain.eq = vi.fn(() => chain);
          chain.limit = vi.fn(async () => ({ data: [{ content_id:'published-1', title:'Repeated public title', draft_markdown:'Published answer.' }], error:null }));
          return chain;
        }
        const chain: any = {};
        chain.eq = vi.fn(() => chain); chain.in = vi.fn(() => chain); chain.order = vi.fn(() => chain);
        chain.limit = vi.fn(async () => ({ data: [row], error:null }));
        return chain;
      }),
      update: supabase.update,
    })) as any;
    const hero = vi.fn(async () => ({ url:'https://example.com/hero.jpg', alt:'Hero', provider:'deterministic' as const }));
    const review = vi.fn(async () => ({ approved:true, reasons:[] }));

    const result = await runAutonomousEditorialEngine({ supabase, provider: {
      draft: async () => ({ title:'Repeated public title', markdown:'## Answer\n\nA duplicate answer.', sources:['https://example.com/source'] }),
      hero,
      review,
    }});

    expect(result).toEqual({ status:'rejected', reason:'duplicate_published_article:duplicate_title' });
    expect(hero).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();
    expect(supabase.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'archived',
      metadata: expect.objectContaining({ archived_reason: 'duplicate_published_article' }),
    }));
  });

  it('quarantines a configured redirect source before drafting or hero spend', async () => {
    const supabase = db({
      ...row,
      content_id: 'legacy-source',
      slug: 'extractability-audit-checklist-for-content-pages',
    });
    const draft = vi.fn(async () => ({
      title: 'Should not be drafted',
      markdown: 'Should not be drafted.',
      sources: ['https://example.com/source'],
    }));
    const hero = vi.fn(async () => ({
      url: 'https://example.com/hero.jpg',
      alt: 'Hero',
      provider: 'deterministic' as const,
    }));
    const review = vi.fn(async () => ({ approved: true, reasons: [] }));

    const result = await runAutonomousEditorialEngine({
      supabase,
      provider: { draft, hero, review },
      now: new Date('2026-10-02T00:30:00Z'),
    });

    expect(result).toEqual({ status: 'rejected', reason: 'public_legacy_redirect_source' });
    expect(draft).not.toHaveBeenCalled();
    expect(hero).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();
    expect(supabase.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'archived',
      metadata: expect.objectContaining({
        editorial_retry_required: false,
        archived_reason: 'public_legacy_redirect_source',
        autonomous_editorial_rejection: expect.objectContaining({
          redirect_source: '/blog/extractability-audit-checklist-for-content-pages',
          canonical_destination: '/blog/crawlable-but-not-extractable',
        }),
      }),
    }));
  });

  it('puts review retries ahead of the normal limited backlog without duplicates', () => {
    expect(mergeEditorialCandidates(
      [{ content_id: 'retry' }],
      [{ content_id: 'normal' }, { content_id: 'retry' }],
    ).map((row) => row.content_id)).toEqual(['retry', 'normal']);
  });

  it('rejects third-vertical fallback seeds and keeps active primary/challenger candidates eligible', () => {
    const selected = selectEditorialCandidateForActiveCampaign([
      {
        content_id: 'ecommerce',
        slug: 'ecommerce',
        content_type: 'article',
        title: 'Ecommerce checklist',
        topic_cluster: 'vertical_strategy_ecommerce',
        status: 'archived',
        metadata: {},
      },
      {
        content_id: 'msp',
        slug: 'msp',
        content_type: 'article',
        title: 'MSP evidence checklist',
        topic_cluster: 'vertical_strategy_msp',
        status: 'archived',
        metadata: { campaign_vertical: 'msp_it_services' },
      },
    ], [primaryCampaign, challengerCampaign]);

    expect(selected?.opportunity.content_id).toBe('msp');
    expect(selected?.campaign.campaign_key).toBe('msp-primary');
    expect(selectEditorialCandidateForActiveCampaign([
      {
        content_id: 'ecommerce',
        slug: 'ecommerce',
        content_type: 'article',
        title: 'Ecommerce checklist',
        topic_cluster: 'vertical_strategy_ecommerce',
        status: 'archived',
        metadata: {},
      },
    ], [primaryCampaign, challengerCampaign])).toBeNull();
  });

  it('uses a neutral archived seed for the primary campaign when no scoped candidate exists', () => {
    const selected = selectEditorialCandidateForActiveCampaign([
      {
        content_id: 'legal',
        slug: 'legal',
        content_type: 'article',
        title: 'Legal benchmark guide',
        topic_cluster: 'vertical_strategy_legal_professional_services',
        status: 'archived',
        metadata: {},
      },
      {
        content_id: 'neutral',
        slug: 'proof-checklist',
        content_type: 'article',
        title: 'Proof checklist',
        topic_cluster: 'trust_signals_and_evidence_hygiene',
        status: 'archived',
        metadata: {},
      },
    ], [primaryCampaign, challengerCampaign]);

    expect(selected?.opportunity.content_id).toBe('neutral');
    expect(selected?.campaign.campaign_key).toBe('msp-primary');
    expect(selected?.gateReason).toBe('primary_campaign_fallback');
    expect(EDITORIAL_FALLBACK_SCAN_LIMIT).toBeGreaterThanOrEqual(100);
  });

  it('rejects an archived seed whose metadata says it should not become an article', () => {
    const selected = selectEditorialCandidateForActiveCampaign([
      {
        content_id: 'homepage-only',
        slug: 'branded-query',
        content_type: 'article',
        title: 'Branded query optimization',
        topic_cluster: 'geo_pulse',
        status: 'archived',
        growth_campaign_id: 'campaign-primary',
        metadata: {
          campaign_vertical: 'msp_it_services',
          archived_reason: 'Branded query belongs to homepage optimization, not a new article.',
        },
      },
      {
        content_id: 'neutral',
        slug: 'evidence-checklist',
        content_type: 'article',
        title: 'Evidence checklist',
        topic_cluster: 'trust_signals_and_evidence_hygiene',
        status: 'archived',
        metadata: {},
      },
    ], [primaryCampaign, challengerCampaign]);

    expect(selected?.opportunity.content_id).toBe('neutral');
    expect(selected?.gateReason).toBe('primary_campaign_fallback');
  });

  it('rejects a retired WIP seed unless it is explicitly approved for editorial retry', () => {
    const retired = {
      content_id: 'retired',
      slug: 'retired-opportunity',
      content_type: 'article',
      title: 'Retired opportunity',
      topic_cluster: 'ai_search_evidence',
      status: 'archived',
      growth_campaign_id: 'campaign-primary',
      metadata: {
        campaign_vertical: 'msp_it_services',
        retired_at: '2026-07-31T00:00:00.000Z',
        retired_reason: 'parent_opportunity_retired_by_vertical_wip_gate',
      },
    };
    const neutral = {
      content_id: 'neutral',
      slug: 'evidence-checklist',
      content_type: 'article',
      title: 'Evidence checklist',
      topic_cluster: 'trust_signals_and_evidence_hygiene',
      status: 'archived',
      metadata: {},
    };

    expect(selectEditorialCandidateForActiveCampaign(
      [retired, neutral],
      [primaryCampaign, challengerCampaign],
    )?.opportunity.content_id).toBe('neutral');
    expect(selectEditorialCandidateForActiveCampaign(
      [{
        ...retired,
        status: 'draft',
        metadata: { ...retired.metadata, editorial_retry_required: true },
      }],
      [primaryCampaign, challengerCampaign],
    )?.opportunity.content_id).toBe('retired');
  });

  it('keeps the primary lane ahead of an available challenger by using a neutral seed', () => {
    const selected = selectEditorialCandidateForActiveCampaign([
      {
        content_id: 'agency', slug: 'agency', content_type: 'article',
        title: 'Agency reporting', topic_cluster: 'vertical_strategy_agencies',
        status: 'archived', metadata: {},
      },
      {
        content_id: 'neutral', slug: 'evidence', content_type: 'article',
        title: 'Evidence checklist', topic_cluster: 'trust_signals_and_evidence_hygiene',
        status: 'archived', metadata: {},
      },
    ], [primaryCampaign, challengerCampaign]);

    expect(selected?.campaign.role).toBe('primary');
    expect(selected?.opportunity.content_id).toBe('neutral');
    expect(selected?.gateReason).toBe('primary_campaign_fallback');
  });

  it('prefers the primary campaign even when a challenger seed sorts first', () => {
    const selected = selectEditorialCandidateForActiveCampaign([
      {
        content_id: 'agency', slug: 'agency', content_type: 'article',
        title: 'Agency reporting', topic_cluster: 'vertical_strategy_agencies',
        status: 'archived', metadata: {},
      },
      {
        content_id: 'msp', slug: 'msp', content_type: 'article',
        title: 'MSP evidence', topic_cluster: 'vertical_strategy_msp',
        status: 'archived', metadata: { campaign_vertical: 'msp_it_services' },
      },
    ], [primaryCampaign, challengerCampaign]);

    expect(selected?.campaign.role).toBe('primary');
    expect(selected?.opportunity.content_id).toBe('msp');
  });

  it('injects the active buyer and offer boundary into the writer topic', () => {
    expect(editorialDraftTopic(row, {
      campaign: primaryCampaign,
      gateReason: 'explicit_campaign_id',
    })).toContain('Buyer: MSP owner');
    expect(editorialDraftTopic(row, {
      campaign: primaryCampaign,
      gateReason: 'explicit_campaign_id',
    })).toContain('Offer and CTA boundary: free_scan -> free_scan');
  });

  it('persists the resolved campaign identity on a published article', async () => {
    const supabase = db();
    const result = await runAutonomousEditorialEngine({
      supabase,
      provider: {
        draft: async () => ({
          title: 'How MSPs can audit AI-search readiness',
          markdown: `# How MSPs can audit AI-search readiness

An MSP should begin with observable website evidence instead of assuming conventional ranking means recommendation visibility.

## What should an MSP inspect first?

- Check that service pages are crawlable and explicit.
- Separate measured evidence from interpretation.

## How should the team verify the baseline?

Use [an AI-search readiness audit](/blog/ai-search-readiness-audit) to establish a bounded baseline.`,
          sources: ['https://developers.google.com/search/docs/appearance/ai-features'],
        }),
        hero: async () => ({
          url: 'https://getgeopulse.com/images/blog/ai-search-readiness-audit.png',
          alt: 'Editorial evidence collage',
          provider: 'deterministic',
        }),
        review: async () => ({ approved: true, reasons: [] }),
      },
    });

    expect(result.status).toBe('created');
    const published = supabase.update.mock.calls.find((call: unknown[]) =>
      (call[0] as Record<string, unknown>)?.['status'] === 'published'
    )?.[0] as Record<string, any>;
    expect(published).toMatchObject({ growth_campaign_id: 'campaign-primary' });
    expect(published.metadata).toMatchObject({
      campaign_key: 'msp-primary',
      campaign_role: 'primary',
      campaign_vertical: 'msp_it_services',
      buyer_role: 'MSP owner',
      offer_key: 'free_scan',
    });
  });

  it('allows a quarantined SEO draft marked for editorial retry to re-enter the full pipeline', async () => {
    const supabase = db();
    const retryRow = {
      ...row,
      status: 'draft',
      metadata: { proposed_by: 'seo_agent', editorial_retry_required: true },
    };
    supabase.from = vi.fn((table: string) => ({
      select: vi.fn((columns: string) => {
        if (table === 'automation_settings') {
          return { eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { feature:'marketing_autopilot', enabled:true, kill_switch:false, config:{} }, error:null })) })) };
        }
        if (table === 'agent_work_loops') {
          return { eq: vi.fn(() => ({ in: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [] })) })) })) };
        }
        if (table === 'growth_campaigns') {
          return { eq: vi.fn(async () => ({ data: [primaryCampaign, challengerCampaign], error: null })) };
        }
        if (columns === 'id') {
          const chain: any = {};
          chain.eq = vi.fn(() => chain); chain.gte = vi.fn(() => chain); chain.limit = vi.fn(async () => ({ data: [] }));
          return chain;
        }
        if (columns === 'content_id,title,draft_markdown') {
          const chain: any = {};
          chain.eq = vi.fn(() => chain); chain.limit = vi.fn(async () => ({ data: [], error:null }));
          return chain;
        }
        const chain: any = {};
        chain.eq = vi.fn(() => chain); chain.in = vi.fn(() => chain); chain.order = vi.fn(() => chain);
        chain.limit = vi.fn(async () => ({ data: [retryRow], error:null }));
        return chain;
      }),
      update: vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) })),
    })) as any;
    const hero = vi.fn(async () => null);

    const result = await runAutonomousEditorialEngine({ supabase, provider: {
      draft: async () => ({ title:'Retry article', markdown:'# Answer\n\n## What should a business verify?\n\nRead [audit](/blog/ai-search-readiness-audit).', sources:['https://example.com'] }),
      hero,
      review: async () => ({ approved:true, reasons:[] }),
    }});

    expect(result).toEqual({ status: 'rejected', reason: 'missing_clean_hero' });
    expect(hero).toHaveBeenCalledOnce();
  });

  it('never writes a draft without a clean hero', async () => {
    const supabase = db();
    const result = await runAutonomousEditorialEngine({ supabase, provider: {
      draft: async () => ({ title:'Useful answer', markdown:'# Useful answer\n\n## What to do\n\nRead [audit](/blog/ai-search-readiness-audit).', sources:['https://example.com'] }),
      hero: async () => null,
      review: async () => ({ approved:true, reasons:[] }),
    }});
    expect(result).toEqual({ status:'rejected', reason:'missing_clean_hero' });
  });

  it('preserves a safe writer failure code when the draft is incomplete', async () => {
    const supabase = db();
    const result = await runAutonomousEditorialEngine({ supabase, provider: {
      draft: async () => ({
        title: '',
        markdown: '',
        sources: [],
        providerFailure: 'workers_ai_empty_response',
      }),
      hero: async () => null,
      review: async () => ({ approved:true, reasons:[] }),
    }});

    expect(result).toEqual({
      status: 'rejected',
      reason: 'incomplete_draft:workers_ai_empty_response',
    });
  });

  it('uses the deterministic hero path when the paid image cap denies generation', async () => {
    const supabase = db();
    supabase.rpc = vi.fn(async () => ({ data: false, error: null }));
    const hero = vi.fn(async () => ({
      url: 'https://getgeopulse.com/images/blog/ai-search-readiness-audit.png',
      alt: 'Editorial evidence collage',
      provider: 'deterministic' as const,
      providerFailure: 'openai_spend_cap',
    }));
    const result = await runAutonomousEditorialEngine({ supabase, provider: {
      heroSpend: { provider: 'openai', estimatedCostUsd: 0.25 },
      draft: async () => ({ title:'Useful answer', markdown:'# Useful answer', sources:['https://example.com'] }),
      hero,
      review: async () => ({ approved:true, reasons:[] }),
    }});
    expect(result.status).not.toBe('skipped');
    expect(hero).toHaveBeenCalledWith(expect.objectContaining({ allowGenerated: false }));
  });
});
