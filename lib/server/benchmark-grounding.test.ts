import { describe, expect, it } from 'vitest';
import {
  buildBenchmarkPrompt,
  DEFAULT_BENCHMARK_RUN_MODE,
  resolveBenchmarkGroundingContext,
  resolveBenchmarkGroundingContextForRun,
  serializeGroundingEvidenceSnapshot,
} from './benchmark-grounding';

describe('resolveBenchmarkGroundingContext', () => {
  it('returns null for ungrounded runs', () => {
    expect(
      resolveBenchmarkGroundingContext(
        {
          metadata: {
            grounding_context: {
              evidence: [{ sourceLabel: 'homepage', text: 'Example builds AI software.' }],
            },
          },
        } as any,
        'ungrounded_inference'
      )
    ).toBeNull();
  });

  it('hydrates grounding evidence from domain metadata for grounded runs', () => {
    const context = resolveBenchmarkGroundingContext(
      {
        metadata: {
          grounding_context: {
            evidence: [
              { sourceLabel: 'homepage', text: 'Example provides healthcare technology consulting.' },
              { source: 'services', text: 'Its services include implementation support.' },
            ],
          },
        },
      } as any,
      'grounded_site'
    );

    expect(context).toEqual({
      mode: 'grounded_site',
      evidence: [
        {
          evidenceId: expect.stringMatching(/^ge-[0-9a-f]{8}$/),
          sourceLabel: 'homepage',
          excerpt: 'Example provides healthcare technology consulting.',
          pageUrl: null,
          pageType: null,
          evidenceLabel: null,
          pageTitle: null,
          fetchStatus: null,
          fetchOrder: null,
          selectionReason: null,
        },
        {
          evidenceId: expect.stringMatching(/^ge-[0-9a-f]{8}$/),
          sourceLabel: 'services',
          excerpt: 'Its services include implementation support.',
          pageUrl: null,
          pageType: null,
          evidenceLabel: null,
          pageTitle: null,
          fetchStatus: null,
          fetchOrder: null,
          selectionReason: null,
        },
      ],
    });
  });

  it('normalizes structured page-level provenance evidence', () => {
    const context = resolveBenchmarkGroundingContext(
      {
        metadata: {
          grounding_context: {
            evidence: [
              {
                page_url: 'https://example.com/about',
                page_type: 'about',
                evidence_label: 'About page',
                excerpt: 'Example helps healthcare organizations modernize operations.',
              },
            ],
          },
        },
      } as any,
      'grounded_site'
    );

    expect(context).toEqual({
      mode: 'grounded_site',
      evidence: [
        {
          evidenceId: expect.stringMatching(/^ge-[0-9a-f]{8}$/),
          sourceLabel: 'About page',
          excerpt: 'Example helps healthcare organizations modernize operations.',
          pageUrl: 'https://example.com/about',
          pageType: 'about',
          evidenceLabel: 'About page',
          pageTitle: null,
          fetchStatus: null,
          fetchOrder: null,
          selectionReason: null,
        },
      ],
    });
  });
});

describe('resolveBenchmarkGroundingContextForRun', () => {
  it('prefers metadata grounding evidence when available', async () => {
    const resolution = await resolveBenchmarkGroundingContextForRun(
      {
        canonical_domain: 'example.com',
        site_url: 'https://example.com/',
        metadata: {
          grounding_context: {
            evidence: [{ sourceLabel: 'homepage', text: 'Example provides healthcare consulting.' }],
          },
        },
      } as any,
      'grounded_site',
      async () => {
        throw new Error('fetch should not be called when metadata evidence exists');
      }
    );

    expect(resolution.source).toBe('metadata');
    expect(resolution.error).toBeNull();
    expect(resolution.context?.evidence).toHaveLength(1);
  });

  it('builds grounding evidence from homepage plus likely about and services pages', async () => {
    const fetchPage = async (url: string) => {
      if (url === 'https://example.com/') {
        return {
          ok: true as const,
          finalUrl: 'https://example.com/',
          html: `
            <html>
              <head><title>Example</title></head>
              <body>
                <p>${'Example helps healthcare organizations modernize workflows. '.repeat(12)}</p>
                <a href="/about">About</a>
                <a href="/services">Services</a>
              </body>
            </html>
          `,
        };
      }

      if (url === 'https://example.com/about') {
        return {
          ok: true as const,
          finalUrl: 'https://example.com/about',
          html: `
            <html>
              <head><title>About Example</title></head>
              <body><p>${'Example is a healthcare technology consulting firm. '.repeat(10)}</p></body>
            </html>
          `,
        };
      }

      if (url === 'https://example.com/services') {
        return {
          ok: true as const,
          finalUrl: 'https://example.com/services',
          html: `
            <html>
              <head><title>Services</title></head>
              <body><p>${'Services include workflow redesign, compliance support, and implementation. '.repeat(10)}</p></body>
            </html>
          `,
        };
      }

      return { ok: false as const, reason: 'unexpected_url' };
    };

    const resolution = await resolveBenchmarkGroundingContextForRun(
      {
        canonical_domain: 'example.com',
        site_url: 'https://example.com/',
        metadata: {},
      } as any,
      'grounded_site',
      fetchPage as any
    );

    expect(resolution.source).toBe('site_builder');
    expect(resolution.error).toBeNull();
    expect(resolution.context?.evidence.map((item) => item.pageType)).toEqual([
      'homepage',
      'about',
      'services',
    ]);
    expect(resolution.context?.evidence[1]).toMatchObject({
      pageUrl: 'https://example.com/about',
      evidenceLabel: 'About Example',
      pageTitle: 'About Example',
      fetchStatus: 'ok',
      fetchOrder: 1,
      selectionReason: 'about_path_priority',
    });
  });

  it('prefers stronger same-origin grounding candidates over low-signal links', async () => {
    const fetchPage = async (url: string) => {
      if (url === 'https://example.com/') {
        return {
          ok: true as const,
          finalUrl: 'https://example.com/',
          html: `
            <html>
              <head><title>Example</title></head>
              <body>
                <p>${'Example helps healthcare organizations modernize workflows. '.repeat(12)}</p>
                <a href="/blog/launch">Launch blog</a>
                <a href="/contact">Contact</a>
                <a href="/platform">Platform</a>
                <a href="/about">About</a>
                <a href="/services">Services</a>
              </body>
            </html>
          `,
        };
      }

      if (url === 'https://example.com/about') {
        return {
          ok: true as const,
          finalUrl: url,
          html: `<html><head><title>About Example</title></head><body><p>${'About copy. '.repeat(30)}</p></body></html>`,
        };
      }

      if (url === 'https://example.com/services') {
        return {
          ok: true as const,
          finalUrl: url,
          html: `<html><head><title>Services</title></head><body><p>${'Services copy. '.repeat(30)}</p></body></html>`,
        };
      }

      if (url === 'https://example.com/platform') {
        return {
          ok: true as const,
          finalUrl: url,
          html: `<html><head><title>Platform</title></head><body><p>${'Platform copy. '.repeat(30)}</p></body></html>`,
        };
      }

      return { ok: false as const, reason: 'unexpected_url' };
    };

    const resolution = await resolveBenchmarkGroundingContextForRun(
      {
        canonical_domain: 'example.com',
        site_url: 'https://example.com/',
        metadata: {},
      } as any,
      'grounded_site',
      fetchPage as any
    );

    expect(resolution.context?.evidence.map((item) => item.pageType)).toEqual([
      'homepage',
      'about',
      'services',
      'product',
    ]);
    expect(resolution.context?.evidence[0]).toMatchObject({
      fetchOrder: 0,
      selectionReason: 'homepage_seed',
      fetchStatus: 'ok',
      pageTitle: 'Example',
    });
  });

  it('falls back to other high-signal pages when about/services links are absent', async () => {
    const fetchPage = async (url: string) => {
      if (url === 'https://example.com/') {
        return {
          ok: true as const,
          finalUrl: 'https://example.com/',
          html: `
            <html>
              <head><title>Example</title></head>
              <body>
                <p>${'Example helps healthcare organizations modernize workflows. '.repeat(12)}</p>
                <a href="/platform">Platform</a>
                <a href="/industries/healthcare">Healthcare</a>
                <a href="/privacy">Privacy</a>
              </body>
            </html>
          `,
        };
      }

      if (url === 'https://example.com/platform') {
        return {
          ok: true as const,
          finalUrl: url,
          html: `<html><head><title>Platform</title></head><body><p>${'Platform copy. '.repeat(30)}</p></body></html>`,
        };
      }

      if (url === 'https://example.com/industries/healthcare') {
        return {
          ok: true as const,
          finalUrl: url,
          html: `<html><head><title>Healthcare</title></head><body><p>${'Healthcare copy. '.repeat(30)}</p></body></html>`,
        };
      }

      return { ok: false as const, reason: 'unexpected_url' };
    };

    const resolution = await resolveBenchmarkGroundingContextForRun(
      {
        canonical_domain: 'example.com',
        site_url: 'https://example.com/',
        metadata: {},
      } as any,
      'grounded_site',
      fetchPage as any
    );

    expect(resolution.context?.evidence.map((item) => item.pageType)).toEqual([
      'homepage',
      'product',
      'other',
    ]);
  });

  it('returns a grounding error when the site builder cannot fetch the homepage', async () => {
    const resolution = await resolveBenchmarkGroundingContextForRun(
      {
        canonical_domain: 'example.com',
        site_url: 'https://example.com/',
        metadata: {},
      } as any,
      'grounded_site',
      async () => ({ ok: false as const, reason: 'Target returned HTTP 404' })
    );

    expect(resolution).toEqual({
      context: null,
      source: 'none',
      error: 'benchmark_grounding_builder_homepage_failed:Target returned HTTP 404',
    });
  });
});

describe('buildBenchmarkPrompt', () => {
  it('keeps ungrounded inference as the default mode', () => {
    const prompt = buildBenchmarkPrompt({
      queryText: 'What is Example?',
      canonicalDomain: 'example.com',
      siteUrl: 'https://example.com/',
      runMode: DEFAULT_BENCHMARK_RUN_MODE,
      groundingContext: null,
    });

    expect(prompt).toContain('ungrounded brand inference mode');
    expect(prompt).toContain('What is Example?');
  });

  it('requires evidence for grounded site mode', () => {
    expect(() =>
      buildBenchmarkPrompt({
        queryText: 'What is Example?',
        canonicalDomain: 'example.com',
        siteUrl: 'https://example.com/',
        runMode: 'grounded_site',
        groundingContext: null,
      })
    ).toThrow('benchmark_grounded_context_missing');
  });

  it('builds a grounded prompt from site evidence', () => {
    const prompt = buildBenchmarkPrompt({
      queryText: 'What is Example?',
      canonicalDomain: 'example.com',
      siteUrl: 'https://example.com/',
      runMode: 'grounded_site',
      groundingContext: {
        mode: 'grounded_site',
        evidence: [
          {
            evidenceId: 'ge-home',
            sourceLabel: 'homepage',
            excerpt: 'Example is a healthcare technology consulting firm.',
            pageUrl: null,
            pageType: null,
            evidenceLabel: null,
            pageTitle: null,
            fetchStatus: null,
            fetchOrder: null,
            selectionReason: null,
          },
        ],
      },
    });

    expect(prompt).toContain(
      'You are answering a question about a company using only the evidence excerpts below, drawn from example.com. Do not use outside knowledge.'
    );
    expect(prompt).toContain(
      'If the evidence does not support a claim, say so explicitly rather than inferring. Paraphrase in your own words instead of copying long phrases from the excerpts. Avoid marketing adjectives unless the evidence clearly supports them.'
    );
    expect(prompt).toContain('Evidence:');
    expect(prompt).toContain('Question: What is Example?');
    expect(prompt).toContain(
      'Answer in 3 to 5 sentences in plain text. Mention example.com naturally at least once when the evidence supports the target company. If the evidence is ambiguous or incomplete, flag that briefly.'
    );
    expect(prompt).toContain('Evidence 1 (homepage): Example is a healthcare technology consulting firm.');
  });

  it('includes page provenance in grounded prompts when available', () => {
    const prompt = buildBenchmarkPrompt({
      queryText: 'What does Example do?',
      canonicalDomain: 'example.com',
      siteUrl: 'https://example.com/',
      runMode: 'grounded_site',
      groundingContext: {
        mode: 'grounded_site',
        evidence: [
          {
            evidenceId: 'ge-about',
            sourceLabel: 'About page',
            excerpt: 'Example helps healthcare organizations modernize operations.',
            pageUrl: 'https://example.com/about',
            pageType: 'about',
            evidenceLabel: 'About page',
            pageTitle: 'About page',
            fetchStatus: null,
            fetchOrder: null,
            selectionReason: null,
          },
        ],
      },
    });

    expect(prompt).toContain(
      'Evidence 1 (About page | about | https://example.com/about): Example helps healthcare organizations modernize operations.'
    );
  });
});

describe('serializeGroundingEvidenceSnapshot', () => {
  it('returns a safe metadata snapshot for grounded evidence', () => {
    expect(
      serializeGroundingEvidenceSnapshot({
        mode: 'grounded_site',
        evidence: [
          {
            evidenceId: 'ge-about',
            sourceLabel: 'About page',
            excerpt: 'Example helps healthcare organizations modernize operations.',
            pageUrl: 'https://example.com/about',
            pageType: 'about',
            evidenceLabel: 'About page',
            pageTitle: 'About page',
            fetchStatus: null,
            fetchOrder: null,
            selectionReason: null,
          },
        ],
      })
    ).toEqual([
      {
        evidence_id: 'ge-about',
        source_label: 'About page',
        page_type: 'about',
        page_url: 'https://example.com/about',
        evidence_label: 'About page',
        page_title: 'About page',
        fetch_status: null,
        fetch_order: null,
        selection_reason: null,
        excerpt: 'Example helps healthcare organizations modernize operations.',
      },
    ]);
  });
});
