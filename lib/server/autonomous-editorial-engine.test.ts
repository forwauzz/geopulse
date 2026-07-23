import { describe, expect, it, vi } from 'vitest';
import { runAutonomousEditorialEngine } from './autonomous-editorial-engine';

const row = { content_id: 'content-1', slug: 'useful-page', title: 'Brief', topic_cluster: 'ai_search_readiness', status: 'brief', metadata: {} };
function db() {
  const update = vi.fn(() => ({ eq: vi.fn(async () => ({ error: null })) }));
  return { from: vi.fn((table: string) => ({
    select: vi.fn(() => table === 'automation_settings'
      ? { eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { feature:'marketing_autopilot', enabled:true, kill_switch:false, config:{} }, error:null })) })) }
      : { eq: vi.fn(() => ({ in: vi.fn(() => ({ order: vi.fn(() => ({ limit: vi.fn(async () => ({ data:[row], error:null })) })) })), limit: vi.fn(async () => ({ data: [{ title:'Existing' }], error:null })) })), limit: vi.fn(async () => ({ data: [{ title:'Existing' }], error:null })) }),
    update,
  })) } as any;
}

describe('autonomous editorial engine', () => {
  it('never writes a draft without a clean hero', async () => {
    const supabase = db();
    const result = await runAutonomousEditorialEngine({ supabase, provider: {
      draft: async () => ({ title:'Useful answer', markdown:'# Useful answer\n\n## What to do\n\nRead [audit](/blog/ai-search-readiness-audit).', sources:['https://example.com'] }),
      hero: async () => null,
      review: async () => ({ approved:true, reasons:[] }),
    }});
    expect(result).toEqual({ status:'rejected', reason:'missing_clean_hero' });
  });
});
