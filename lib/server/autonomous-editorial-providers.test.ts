import { describe, expect, it, vi } from 'vitest';
import {
  CLEAN_EDITORIAL_HERO_ALT,
  DETERMINISTIC_EDITORIAL_HERO_PATH,
  TRUSTED_EDITORIAL_SOURCES,
  createAutonomousEditorialProvider,
  normalizeGeneratedEditorialMarkdown,
} from './autonomous-editorial-providers';

describe('autonomous editorial draft safety', () => {
  it('removes invented routes and sources while appending verified sources and CTA', () => {
    const markdown = normalizeGeneratedEditorialMarkdown(`# Answer

Read [the wrong brand](https://www.geopulse.com/blog/fake), [a fake first-party article](https://getgeopulse.com/blog/fake), and [a made-up route](/features/ai-rankings).

## What should a business verify?

Check [the readiness guide](/blog/ai-search-readiness-audit).`);

    expect(markdown).not.toContain('geopulse.com');
    expect(markdown).not.toContain('getgeopulse.com/blog/fake');
    expect(markdown).not.toContain('/features/ai-rankings');
    expect(markdown).toContain('](/blog/ai-search-readiness-audit)');
    expect(markdown).toContain(`](${TRUSTED_EDITORIAL_SOURCES[0].url})`);
    expect(markdown).toContain(`](${TRUSTED_EDITORIAL_SOURCES[1].url})`);
    expect(markdown).toContain('[free AI-search readiness scan](/)');
  });

  it('ignores model-provided source URLs and gives the reviewer only verified sources', async () => {
    const run = vi.fn().mockResolvedValue({ response: JSON.stringify({
      title: 'What should a business verify before changing its website?',
      markdown: '# Direct answer\n\n## What should a business verify?\n\nRead [bad](https://www.geopulse.com/fake).',
      sources: ['https://www.geopulse.com/fake'],
    }) });
    const provider = createAutonomousEditorialProvider({ AI: { run } });
    const draft = await provider.draft({ topic: 'ai_search_monitoring', existingTitles: [] });

    expect(draft.sources).toEqual(TRUSTED_EDITORIAL_SOURCES.map((source) => source.url));
    expect(draft.markdown).not.toContain('geopulse.com');
    expect(String((run.mock.calls[0]?.[1] as { messages?: Array<{ content?: string }> })?.messages?.[0]?.content)).toContain('Do not invent');
  });

  it('routes the bounded audit CTA to the commercial audit surface', async () => {
    const run = vi.fn().mockResolvedValue({ response: `<article_title>What should an MSP verify?</article_title>
<article_markdown>Start with observable evidence.

## What should the team inspect?

Read [the MSP evidence guide](/blog/msp-service-claims-verifiable-evidence).
</article_markdown>` });
    const provider = createAutonomousEditorialProvider({ AI: { run } });

    await provider.draft({ topic: 'msp evidence', existingTitles: [] });

    const prompt = String(
      (run.mock.calls[0]?.[1] as { messages?: Array<{ content?: string }> })?.messages?.[1]?.content
    );
    expect(prompt).toContain('/ai-visibility-audit');
    expect(prompt).not.toContain('/blog/ai-search-readiness-audit');
  });

  it('returns a bounded provider code instead of exposing writer failure text', async () => {
    const run = vi.fn().mockRejectedValue(new Error('Upstream 429: secret provider detail'));
    const provider = createAutonomousEditorialProvider({ AI: { run } });

    const draft = await provider.draft({ topic: 'msp evidence', existingTitles: [] });

    expect(draft).toEqual({
      title: '',
      markdown: '',
      sources: [],
      providerFailure: 'workers_ai_http_429',
    });
  });

  it('identifies writer contract failures without retaining the model payload', async () => {
    const run = vi.fn().mockResolvedValue({ response: 'not-json private model output' });
    const provider = createAutonomousEditorialProvider({ AI: { run } });

    const draft = await provider.draft({ topic: 'msp evidence', existingTitles: [] });

    expect(draft).toEqual({
      title: '',
      markdown: '',
      sources: TRUSTED_EDITORIAL_SOURCES.map((source) => source.url),
      providerFailure: 'writer_contract_parse_failed',
    });
  });

  it('accepts a fenced JSON response without weakening the article checks', async () => {
    const run = vi.fn().mockResolvedValue({ response: `\`\`\`json
{"title":"What evidence should an MSP publish?","markdown":"# Direct answer\\n\\nPublish evidence buyers can verify.\\n\\n## What should a buyer check?\\n\\nUse [the MSP guide](/blog/msp-service-claims-verifiable-evidence)."}
\`\`\`` });
    const provider = createAutonomousEditorialProvider({ AI: { run } });

    const draft = await provider.draft({ topic: 'msp evidence', existingTitles: [] });

    expect(draft.title).toBe('What evidence should an MSP publish?');
    expect(draft.markdown).toContain('Publish evidence buyers can verify.');
    expect(draft.providerFailure).toBeUndefined();
  });

  it('accepts the bounded long-form envelope with unescaped Markdown', async () => {
    const run = vi.fn().mockResolvedValue({ response: `<article_title>What should an MSP verify before making a claim?</article_title>
<article_markdown># Direct answer

Verify that each service claim has public evidence.

## What should a buyer check?

Read [the MSP evidence guide](/blog/msp-service-claims-verifiable-evidence).
</article_markdown>` });
    const provider = createAutonomousEditorialProvider({ AI: { run } });

    const draft = await provider.draft({ topic: 'msp evidence', existingTitles: [] });

    expect(draft.title).toBe('What should an MSP verify before making a claim?');
    expect(draft.providerFailure).toBeUndefined();
    expect(draft.markdown).toContain('Verify that each service claim has public evidence.');
    expect(draft.sources).toEqual(TRUSTED_EDITORIAL_SOURCES.map((source) => source.url));
  });
});

describe('autonomous editorial hero', () => {
  it('uses a clean descriptive alt independent of AI terms in the article title', async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ b64_json: Buffer.from('fake-jpeg-bytes').toString('base64') }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );
    const provider = createAutonomousEditorialProvider(
      {
        OPENAI_API_KEY: 'test-key',
        EDITORIAL_HERO_PUBLIC_BASE: 'https://media.example.com',
        REPORT_FILES: { put },
      },
      fetchImpl
    );

    const hero = await provider.hero({
      title: 'AI Search Readiness Without Generic AI Buzzwords',
      markdown: 'Source-backed article body.',
      allowGenerated: true,
    });

    expect(hero).toMatchObject({
      alt: CLEAN_EDITORIAL_HERO_ALT,
      provider: 'openai',
    });
    expect(hero?.alt).not.toMatch(/\b(ai|robot|future|innovation)\b/i);
    expect(hero?.url).toMatch(
      /^https:\/\/media\.example\.com\/editorial-heroes\/ai-search-readiness-without-generic-ai-buzzwords-\d+\.jpg$/
    );
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body))).toMatchObject({
      output_format: 'jpeg',
      size: '1024x1024',
    });
    expect(JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body)).prompt).toContain(
      'central 80% safe area'
    );
    expect(put.mock.calls[0]?.[2]).toMatchObject({
      httpMetadata: { contentType: 'image/jpeg' },
    });
    expect(put).toHaveBeenCalledOnce();
  });

  it('returns a branded deterministic hero and a safe provider code when image credit is unavailable', async () => {
    const provider = createAutonomousEditorialProvider({
      NEXT_PUBLIC_APP_URL: 'https://getgeopulse.com/',
    });
    const hero = await provider.hero({
      title: 'MSP proof buyers can verify',
      markdown: 'Source-backed article body.',
      allowGenerated: false,
    });

    expect(hero).toEqual({
      url: `https://getgeopulse.com${DETERMINISTIC_EDITORIAL_HERO_PATH}`,
      alt: CLEAN_EDITORIAL_HERO_ALT,
      provider: 'deterministic',
      providerFailure: 'openai_not_configured',
    });
  });

  it('falls back without exposing provider response text', async () => {
    const provider = createAutonomousEditorialProvider(
      {
        OPENAI_API_KEY: 'test-key',
        EDITORIAL_HERO_PUBLIC_BASE: 'https://media.example.com',
        NEXT_PUBLIC_APP_URL: 'https://getgeopulse.com',
        REPORT_FILES: { put: vi.fn() },
      },
      vi.fn().mockResolvedValue(new Response(JSON.stringify({
        error: { code: 'insufficient_quota', message: 'secret provider detail' },
      }), { status: 429 }))
    );
    const hero = await provider.hero({ title: 'MSP evidence', markdown: 'Body', allowGenerated: true });
    expect(hero).toMatchObject({
      provider: 'deterministic',
      providerFailure: 'openai_http_429_insufficient_quota',
    });
    expect(JSON.stringify(hero)).not.toContain('secret provider detail');
  });

  it('rejects geographic SEO when GEO should mean generative engine optimization', async () => {
    const provider = createAutonomousEditorialProvider({});
    const review = await provider.review({
      title: 'A Guide to Geo Optimization',
      markdown: 'Use location-specific keywords to reach a geographic audience in your target location.',
      sources: ['https://developers.google.com/search'],
      hero: {
        url: 'https://media.example.com/hero.jpg',
        alt: CLEAN_EDITORIAL_HERO_ALT,
      },
    });

    expect(review).toEqual({
      approved: false,
      reasons: ['GEO was misinterpreted as geographic or local-search optimization'],
    });
  });
});
