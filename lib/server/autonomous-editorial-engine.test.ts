import { describe, expect, it, vi } from 'vitest';
import {
  AUTONOMOUS_EDITORIAL_SOURCE_TYPE,
  ensureEditorialInternalBlogLink,
  mergeEditorialCandidates,
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
function db() {
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
      if (columns === 'title') {
        return { eq: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [{ title:'Existing' }], error:null })) })) };
      }
      const chain: any = {};
      chain.eq = vi.fn(() => chain);
      chain.in = vi.fn(() => chain);
      chain.order = vi.fn(() => chain);
      chain.limit = vi.fn(async () => ({ data:[row], error:null }));
      return chain;
    }),
    update,
  })) } as any;
}

describe('autonomous editorial engine', () => {
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
        if (columns === 'title') return { eq: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [], error:null })) })) };
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
