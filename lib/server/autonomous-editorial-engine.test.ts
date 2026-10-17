import { describe, expect, it, vi } from 'vitest';
import {
  AUTONOMOUS_EDITORIAL_SOURCE_TYPE,
  EDITORIAL_FALLBACK_SCAN_LIMIT,
  editorialDraftTopic,
  ensureEditorialInternalBlogLink,
  findEditorialConversionContractViolation,
  findPublishedEditorialDuplicate,
  findUnsupportedEditorialClaim,
  mergeEditorialCandidates,
  removeRedundantEditorialH1,
  runAutonomousEditorialEngine,
  selectEditorialCandidateForActiveCampaign,
  verifiedEditorialBriefSources,
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
function db(candidate: typeof row | null = row) {
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
      if (columns === 'content_id,title,topic_cluster,draft_markdown') {
        const chain: any = {};
        chain.eq = vi.fn(() => chain);
        chain.limit = vi.fn(async () => ({ data: [{ content_id:'existing', title:'Existing', draft_markdown:'Existing answer.' }], error:null }));
        return chain;
      }
      const chain: any = {};
      chain.eq = vi.fn(() => chain);
      chain.in = vi.fn(() => chain);
      chain.order = vi.fn(() => chain);
      chain.limit = vi.fn(async () => ({ data: candidate ? [candidate] : [], error:null }));
      return chain;
    }),
    update,
  })) } as any;
}

describe('autonomous editorial engine', () => {
  it('reports exhausted active-campaign inventory as a rejected health signal', async () => {
    const provider = {
      draft: vi.fn(() => { throw new Error('draft must not run without an eligible candidate'); }),
      hero: vi.fn(() => { throw new Error('hero must not run without an eligible candidate'); }),
      review: vi.fn(() => { throw new Error('review must not run without an eligible candidate'); }),
    };

    await expect(runAutonomousEditorialEngine({
      supabase: db(null),
      provider,
    })).resolves.toEqual({
      status: 'rejected',
      reason: 'no_active_campaign_candidate',
    });
    expect(provider.draft).not.toHaveBeenCalled();
  });

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

  it('rejects near-duplicate published leads while allowing a materially different opening', () => {
    const published = [{
      content_id: 'published-generic-lead',
      title: 'Earlier MSP evidence guide',
      draft_markdown: 'To determine whether an MSP website gives AI answer engines sufficient evidence to understand its services, operators should measure crawler access, answer clarity, source quality, and repeated visibility with a consistent weekly review.',
    }];

    expect(findPublishedEditorialDuplicate({
      title: 'A new social evidence guide',
      markdown: 'To determine if an MSP website provides AI answer engines with sufficient evidence to understand its services, operators should measure answer clarity, crawler access, source quality, and repeatable visibility through a consistent weekly review.',
    }, published)).toMatchObject({
      contentId: 'published-generic-lead',
      reason: 'duplicate_lead_overlap',
    });

    expect(findPublishedEditorialDuplicate({
      title: 'A field guide to evidence reviews',
      markdown: 'A Toronto managed-service provider found that its highest-intent prospects repeatedly paused on the same unsupported service claim. The team replaced that claim with a dated customer-safe proof block and measured the effect on qualified scan starts.',
    }, published)).toBeNull();
  });

  it('rejects a near-equivalent published title while preserving differentiated series entries', () => {
    const published = [{
      content_id: 'schema-pattern',
      title: 'Developing a Schema Strategy for AI-Search Readiness',
      topic_cluster: 'schema_strategy',
      draft_markdown: 'A case pattern with a distinct lead.',
    }];

    expect(findPublishedEditorialDuplicate({
      title: 'AI-Search Readiness for MSPs: Developing a Schema Strategy',
      markdown: 'A checklist with a different lead.',
      topicCluster: 'schema_strategy',
    }, published)).toMatchObject({
      contentId: 'schema-pattern',
      reason: 'duplicate_title_overlap',
    });

    expect(findPublishedEditorialDuplicate({
      title: 'Schema Quality Checklist for MSP Websites',
      markdown: 'A checklist with a different lead.',
      topicCluster: 'schema_strategy',
    }, published)).toBeNull();

    expect(findPublishedEditorialDuplicate({
      title: 'AI-Search Readiness for MSPs: Developing a Schema Strategy',
      markdown: 'A checklist with a different lead.',
      topicCluster: 'different_topic',
    }, published)).toBeNull();
  });

  it('fails closed on unsupported cross-engine ranking claims while allowing bounded freshness guidance', () => {
    expect(findUnsupportedEditorialClaim(
      'Freshness refers to how often a page is updated. AI search engines prioritize fresh content, as it is more likely to be relevant.'
    )).toMatchObject({
      code: 'search_system_priority_claim',
      excerpt: 'AI search engines prioritize fresh content, as it is more likely to be relevant.',
    });

    expect(findUnsupportedEditorialClaim(
      'Check the visible publication and update dates, then review search and conversion evidence over time.'
    )).toBeNull();
    expect(findUnsupportedEditorialClaim(
      'Do AI search engines prioritize recently updated pages? Test that question against dated observations.'
    )).toBeNull();
  });

  it('quarantines an unsupported search-system claim before hero spend or review', async () => {
    const supabase = db();
    const hero = vi.fn(async () => ({ url:'https://example.com/hero.jpg', alt:'Hero', provider:'deterministic' as const }));
    const review = vi.fn(async () => ({ approved:true, reasons:[] }));

    const result = await runAutonomousEditorialEngine({ supabase, provider: {
      draft: async () => ({
        title:'Freshness checklist',
        markdown:'## Answer\n\nAI search engines prioritize fresh content, so every page should be updated weekly.',
        sources:['https://example.com/source'],
      }),
      hero,
      review,
    }});

    expect(result).toEqual({
      status:'rejected',
      reason:'unsupported_editorial_claim:search_system_priority_claim',
    });
    expect(hero).not.toHaveBeenCalled();
    expect(review).not.toHaveBeenCalled();
    expect(supabase.update).toHaveBeenCalledWith(expect.objectContaining({
      status: 'archived',
      metadata: expect.objectContaining({
        archived_reason: 'unsupported_editorial_claim',
        autonomous_editorial_rejection: expect.objectContaining({
          reason: 'search_system_priority_claim',
        }),
      }),
    }));
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
        if (columns === 'content_id,title,topic_cluster,draft_markdown') {
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

  it('uses source links only when the brief records verification evidence', () => {
    expect(verifiedEditorialBriefSources({
      ...row,
      source_links: ['https://www.cisa.gov/example'],
      metadata: { ...row.metadata, source_verified_at: '2026-10-15T12:00:00Z' },
    })).toEqual(['https://www.cisa.gov/example']);
    expect(verifiedEditorialBriefSources({
      ...row,
      source_links: ['https://www.cisa.gov/example'],
      metadata: row.metadata,
    })).toEqual([]);
  });

  it('preserves verified brief grounding and buyer context for the writer', async () => {
    const groundedRow = {
      ...row,
      title: 'What an MSP incident-response page should make clear',
      source_links: ['https://www.cisa.gov/stopransomware/guide'],
      brief_markdown: 'Distinguish public responsibility statements from certification claims.',
      target_persona: 'Quebec MSP owner',
      primary_problem: 'Buyers cannot tell which incident-response tasks belong to the MSP.',
      metadata: {
        ...row.metadata,
        source_verified_at: '2026-10-15T12:05:10Z',
      },
    };
    const draft = vi.fn(async () => ({
      title: 'Incident-response responsibility evidence for MSP buyers',
      markdown: 'A distinct source-backed answer for buyers.',
      sources: ['https://www.cisa.gov/stopransomware/guide'],
    }));

    await runAutonomousEditorialEngine({
      supabase: db(groundedRow as any),
      provider: {
        draft,
        hero: async () => null,
        review: async () => ({ approved: true, reasons: [] }),
      },
    });

    expect(draft).toHaveBeenCalledWith(expect.objectContaining({
      briefTitle: groundedRow.title,
      briefMarkdown: groundedRow.brief_markdown,
      targetPersona: groundedRow.target_persona,
      primaryProblem: groundedRow.primary_problem,
      verifiedSourceLinks: groundedRow.source_links,
    }));
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

  it('does not resurrect a rejected or stopped editorial experiment without an explicit retry', () => {
    const stopped = {
      content_id: 'stopped-experiment',
      slug: 'stopped-experiment',
      content_type: 'article',
      title: 'Stopped experiment',
      topic_cluster: 'msp_backup_recovery_claim_evidence_for_ai_search',
      status: 'archived',
      growth_campaign_id: 'campaign-primary',
      metadata: {
        campaign_vertical: 'msp_it_services',
        rejected_at: '2026-10-17T04:02:05.952Z',
        rejection_signal: 'sources_did_not_support_the_ai_search_bridge',
        experiment_disposition: 'stopped_after_automatic_editorial_rejection',
        editorial_retry_required: false,
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
      [stopped, neutral],
      [primaryCampaign, challengerCampaign],
    )?.opportunity.content_id).toBe('neutral');
    expect(selectEditorialCandidateForActiveCampaign(
      [{
        ...stopped,
        status: 'draft',
        metadata: { ...stopped.metadata, editorial_retry_required: true },
      }],
      [primaryCampaign, challengerCampaign],
    )?.opportunity.content_id).toBe('stopped-experiment');
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

  it('gives the writer public campaign context without exposing internal identifiers', () => {
    const topic = editorialDraftTopic(row, {
      campaign: primaryCampaign,
      gateReason: 'explicit_campaign_id',
    });
    expect(topic).toContain('Buyer: MSP owner');
    expect(topic).toContain('Relevant solution page: /solutions/msps');
    expect(topic).not.toContain(primaryCampaign.campaign_key);
    expect(topic).not.toContain(primaryCampaign.offer_key);
    expect(topic).not.toContain(primaryCampaign.cta_goal);
    expect(topic).not.toContain('explicit_campaign_id');
    expect(topic).toContain('Required public CTA copy:');
    expect(topic).toContain('Address the buyer directly');
  });

  it('rejects internal campaign identifiers, cross-vertical links, and leaked writer instructions', () => {
    expect(findEditorialConversionContractViolation(
      'Start at agency_client_visibility_baseline.',
      { ...challengerCampaign, cta_goal: 'agency_client_visibility_baseline' },
    )).toMatchObject({ code: 'internal_identifier_exposed' });
    expect(findEditorialConversionContractViolation(
      'Agencies can learn more at [the MSP page](/solutions/msps).',
      challengerCampaign,
    )).toMatchObject({ code: 'wrong_vertical_solution_link' });
    expect(findEditorialConversionContractViolation(
      'Agencies can learn more at [the agency page](/solutions/agencies).',
      challengerCampaign,
    )).toBeNull();
    expect(findEditorialConversionContractViolation(
      'Invite the reader to run the free GEO-Pulse AI-search readiness scan at /.',
      primaryCampaign,
    )).toMatchObject({ code: 'editorial_instruction_exposed' });
    expect(findEditorialConversionContractViolation(
      'Run a [free GEO-Pulse AI-search readiness scan](/) to inspect the public evidence on your site.',
      primaryCampaign,
    )).toBeNull();
  });

  it('fails closed before hero generation when a draft leaks a writer instruction', async () => {
    const supabase = db();
    const hero = vi.fn(async () => null);
    const result = await runAutonomousEditorialEngine({ supabase, provider: {
      draft: async () => ({
        title: 'Useful answer',
        markdown: 'A source-backed answer.\n\n## Next step\n\nInvite the reader to run the free scan at /.\n\nRead [the audit guide](/blog/ai-search-readiness-audit).',
        sources: ['https://example.com'],
      }),
      hero,
      review: async () => ({ approved:true, reasons:[] }),
    }});

    expect(result).toEqual({
      status: 'rejected',
      reason: 'unsafe_conversion_contract:editorial_instruction_exposed',
    });
    expect(hero).not.toHaveBeenCalled();
  });

  it('fails closed before hero generation when a draft leaks an internal campaign key', async () => {
    const supabase = db();
    const hero = vi.fn(async () => null);
    const result = await runAutonomousEditorialEngine({ supabase, provider: {
      draft: async () => ({
        title: 'Useful answer',
        markdown: `A source-backed answer.\n\n## What should the team do?\n\nUse campaign msp-primary to begin.\n\nRead [audit](/blog/ai-search-readiness-audit).`,
        sources: ['https://example.com'],
      }),
      hero,
      review: async () => ({ approved:true, reasons:[] }),
    }});

    expect(result).toEqual({
      status: 'rejected',
      reason: 'unsafe_conversion_contract:internal_identifier_exposed',
    });
    expect(hero).not.toHaveBeenCalled();
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
        if (columns === 'content_id,title,topic_cluster,draft_markdown') {
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
