import { describe, expect, it, vi } from 'vitest';
import {
  CLEAN_EDITORIAL_HERO_ALT,
  createAutonomousEditorialProvider,
} from './autonomous-editorial-providers';

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
    });

    expect(hero).toMatchObject({
      alt: CLEAN_EDITORIAL_HERO_ALT,
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
});
