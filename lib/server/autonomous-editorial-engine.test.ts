import { describe, expect, it, vi } from 'vitest';
import {
  AUTONOMOUS_EDITORIAL_SOURCE_TYPE,
  ensureEditorialInternalBlogLink,
  mergeEditorialCandidates,
  runAutonomousEditorialEngine,
} from './autonomous-editorial-engine';

const row = { content_id: 'content-1', slug: 'useful-page', title: 'Brief', topic_cluster: 'ai_search_readiness', status: 'brief', metadata: {} };
function db() {
  const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
  return { from: vi.fn((table: string) => ({
    select: vi.fn((columns: string) => {
      if (table === 'automation_settings') {
        return { eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { feature:'marketing_autopilot', enabled:true, kill_switch:false, config:{} }, error:null })) })) };
      }
      if (table === 'agent_work_loops') {
        return { eq: vi.fn(() => ({ in: vi.fn(() => ({ limit: vi.fn(async () => ({ data: [] })) })) })) };
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
