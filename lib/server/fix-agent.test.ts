import { describe, expect, it } from 'vitest';
import { buildFixAgentPrompt, runFixAgent } from './fix-agent';
import { STRUCTURED_WORKERS_AI_MODEL } from './workers-ai';

const ISSUES = [{ check: 'JSON-LD', finding: 'No structured data found', passed: false, weight: 10 }];

function fakeSupabaseWithScan(fullResults: Record<string, unknown>) {
  return {
    from() {
      return {
        select() {
          return {
            eq() {
              return this;
            },
            order() {
              return this;
            },
            limit() {
              return this;
            },
            maybeSingle: async () => ({
              data: {
                id: 'scan-1',
                domain: 'geopulse.example',
                url: 'https://geopulse.example/',
                score: 40,
                issues_json: ISSUES,
                full_results_json: fullResults,
              },
            }),
          };
        },
      };
    },
  } as never;
}

describe('buildFixAgentPrompt', () => {
  it('embeds the audited page content as the source of truth', () => {
    const prompt = buildFixAgentPrompt('geopulse.example', ISSUES, 'GeoPulse is an AI search readiness tool.');
    expect(prompt).toContain('AI search readiness tool');
    expect(prompt).toContain('ONLY source of truth');
    expect(prompt).not.toContain('infer sensible values from the domain');
  });

  it('never asks the model to infer facts from the domain, even without a sample', () => {
    const prompt = buildFixAgentPrompt('geopulse.example', ISSUES);
    expect(prompt).not.toContain('ONLY source of truth');
    expect(prompt).not.toContain('infer sensible values from the domain');
    expect(prompt).toContain('keep them neutral when unknown');
  });

  it('caps an oversized page sample', () => {
    const prompt = buildFixAgentPrompt('geopulse.example', ISSUES, 'x'.repeat(50_000));
    expect(prompt.length).toBeLessThan(10_000);
  });
});

describe('runFixAgent', () => {
  it('routes the structured call to the JSON-tuned model and grounds it in the stored page sample', async () => {
    const calls: Array<{ model: string; prompt: string }> = [];
    const ai = {
      run: async (model: string, input: Record<string, unknown>) => {
        const messages = input['messages'] as Array<{ role: string; content: string }>;
        calls.push({ model, prompt: messages[messages.length - 1]?.content ?? '' });
        return { response: '{ "fixes": [ { "title": "Add JSON-LD", "why": "w", "where": "head", "snippet": "<script></script>" } ] }' };
      },
    };
    const result = await runFixAgent({
      supabase: fakeSupabaseWithScan({ pageSample: 'GeoPulse audits sites for AI answer engines.' }),
      ai,
      userId: 'u-1',
    });
    expect(result.ok).toBe(true);
    expect(calls[0]?.model).toBe(STRUCTURED_WORKERS_AI_MODEL);
    expect(calls[0]?.prompt).toContain('GeoPulse audits sites');
  });

  it('respects an explicit model override', async () => {
    const calls: string[] = [];
    const ai = {
      run: async (model: string) => {
        calls.push(model);
        return { response: '{ "fixes": [ { "title": "t", "snippet": "s" } ] }' };
      },
    };
    await runFixAgent({
      supabase: fakeSupabaseWithScan({}),
      ai,
      userId: 'u-1',
      model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    });
    expect(calls[0]).toBe('@cf/meta/llama-3.3-70b-instruct-fp8-fast');
  });
});
