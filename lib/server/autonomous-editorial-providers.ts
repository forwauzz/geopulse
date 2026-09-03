import type { EditorialProvider } from './autonomous-editorial-engine';
import { runWorkersAiPrompt, type WorkersAiBinding } from './workers-ai';

type R2Bucket = {
  put(
    key: string,
    value: ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string } }
  ): Promise<unknown>;
  get?(key: string): Promise<{ arrayBuffer(): Promise<ArrayBuffer> } | null>;
};
type FetchLike = typeof fetch;

export type AutonomousEditorialEnv = {
  readonly AI?: WorkersAiBinding;
  readonly OPENAI_API_KEY?: string;
  readonly OPENAI_IMAGE_MODEL?: string;
  readonly EDITORIAL_HERO_PUBLIC_BASE?: string;
  readonly EDITORIAL_WRITER_MODEL?: string;
  readonly EDITORIAL_REVIEWER_MODEL?: string;
  readonly NEXT_PUBLIC_APP_URL?: string;
  readonly REPORT_FILES?: R2Bucket;
};

export const CLEAN_EDITORIAL_HERO_ALT =
  'Editorial collage of documents, evidence, and connected systems on warm paper';

export const DETERMINISTIC_EDITORIAL_HERO_PATH = '/images/blog/ai-search-readiness-audit.png';

export const TRUSTED_EDITORIAL_SOURCES = [
  {
    label: 'Google Search: AI features and your website',
    url: 'https://developers.google.com/search/docs/appearance/ai-features',
  },
  {
    label: 'OpenAI: Publishers and developers FAQ',
    url: 'https://help.openai.com/en/articles/12627856-publishers-and-developers-faq',
  },
] as const;

const APPROVED_EDITORIAL_INTERNAL_PATHS = [
  '/',
  '/ai-seo-audit',
  '/ai-visibility-audit',
  '/generative-engine-optimization',
  '/pricing',
  '/solutions/msps',
  '/solutions/agencies',
  '/blog/ai-search-readiness-audit',
  '/blog/msp-service-claims-verifiable-evidence',
] as const;

function isApprovedEditorialHref(href: string): boolean {
  if (TRUSTED_EDITORIAL_SOURCES.some((source) => source.url === href)) return true;
  if (href.startsWith('/')) {
    return APPROVED_EDITORIAL_INTERNAL_PATHS.some((path) => href === path || href.startsWith(`${path}#`));
  }
  try {
    const parsed = new URL(href);
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'getgeopulse.com') return false;
    return APPROVED_EDITORIAL_INTERNAL_PATHS.some((path) => parsed.pathname === path);
  } catch {
    return false;
  }
}

export function normalizeGeneratedEditorialMarkdown(markdown: string): string {
  const safeLinks = markdown.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label: string, rawHref: string) => {
    const href = rawHref.trim();
    return isApprovedEditorialHref(href) ? match : label;
  });
  const sources = TRUSTED_EDITORIAL_SOURCES
    .filter((source) => !safeLinks.includes(`](${source.url})`))
    .map((source) => `- [${source.label}](${source.url})`);
  const withSources = sources.length > 0
    ? `${safeLinks.trimEnd()}\n\n## Sources used\n\n${sources.join('\n')}`
    : safeLinks.trimEnd();
  return /\]\(\/(?:\)|#)/.test(withSources)
    ? withSources
    : `${withSources}\n\n## Measure your current baseline\n\nRun a [free AI-search readiness scan](/) to see the public evidence available on your website before deciding what to change.`;
}

function deterministicHero(env: AutonomousEditorialEnv, providerFailure: string) {
  const base = (env.NEXT_PUBLIC_APP_URL?.trim() || 'https://getgeopulse.com').replace(/\/+$/, '');
  return {
    url: `${base}${DETERMINISTIC_EDITORIAL_HERO_PATH}`,
    alt: CLEAN_EDITORIAL_HERO_ALT,
    provider: 'deterministic' as const,
    providerFailure,
  };
}

function safeProviderCode(value: unknown): string {
  return typeof value === 'string'
    ? value.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80)
    : '';
}

function safeWriterProviderFailure(reason: string): string {
  const normalized = reason.toLowerCase();
  if (/\b(?:http|status|upstream)[ _-]*429\b/.test(normalized)) return 'workers_ai_http_429';
  if (/quota|credit|billing|payment/.test(normalized)) return 'workers_ai_quota';
  if (/timeout|timed out/.test(normalized)) return 'workers_ai_timeout';
  if (/binding[_ -]missing/.test(normalized)) return 'workers_ai_binding_missing';
  if (/empty[_ -]response/.test(normalized)) return 'workers_ai_empty_response';
  return 'workers_ai_request_failed';
}

function stripSingleModelFence(text: string): string {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json|markdown|md|text)?\s*\r?\n([\s\S]*?)\r?\n```$/i);
  return (fenced?.[1] ?? trimmed).trim();
}

function jsonFromModel(text: string): Record<string, unknown> | null {
  const normalized = stripSingleModelFence(text);
  const firstBrace = normalized.indexOf('{');
  const lastBrace = normalized.lastIndexOf('}');
  const candidates = [
    normalized,
    ...(firstBrace >= 0 && lastBrace > firstBrace
      ? [normalized.slice(firstBrace, lastBrace + 1)]
      : []),
  ];
  for (const candidate of [...new Set(candidates)]) {
    try {
      const value: unknown = JSON.parse(candidate);
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return value as Record<string, unknown>;
      }
    } catch {
      // A long Markdown body is allowed to use the deterministic envelope below instead.
    }
  }
  return null;
}

function editorialDraftFromModel(text: string): { title: string; markdown: string } | null {
  const json = jsonFromModel(text);
  if (json) {
    return {
      title: typeof json.title === 'string' ? json.title.trim() : '',
      markdown: typeof json.markdown === 'string' ? json.markdown.trim() : '',
    };
  }

  const normalized = stripSingleModelFence(text);
  const envelope = normalized.match(
    /^<article_title>\s*([^\r\n]+?)\s*<\/article_title>\s*<article_markdown>\s*([\s\S]+?)\s*<\/article_markdown>$/i,
  );
  if (!envelope) return null;
  const title = envelope[1]?.trim() ?? '';
  const markdown = envelope[2]?.trim() ?? '';
  return title && markdown ? { title, markdown } : null;
}

export function createAutonomousEditorialProvider(env: AutonomousEditorialEnv, fetchImpl: FetchLike = fetch): EditorialProvider {
  return {
    heroSpend:
      env.OPENAI_API_KEY?.trim() && env.EDITORIAL_HERO_PUBLIC_BASE && env.REPORT_FILES
        ? { provider: 'openai', estimatedCostUsd: 0.25 }
        : undefined,
    async draft({ topic, existingTitles }) {
      const trustedSources = TRUSTED_EDITORIAL_SOURCES.map((source) => `${source.label}: ${source.url}`).join('\n');
      const result = await runWorkersAiPrompt({ ai: env.AI, model: env.EDITORIAL_WRITER_MODEL, maxTokens: 3500,
        system: `You write practical, source-backed GEO-Pulse articles about generative engine optimization (GEO) and AI-search readiness. Use AI-search readiness as the primary term. If GEO appears, write "In this article, GEO means generative engine optimization" once; never use GEO to mean geographic or local-search optimization. Do not introduce AEO, AI SEO, or LLM optimization as aliases. Explain observable website evidence, crawler access, answer clarity, and repeatable measurement. Do not promise or imply rankings, citations, traffic, revenue, or improved visibility. Do not invent statistics, customer results, URLs, product capabilities, or sources. Use only the exact source URLs and exact internal routes supplied by the user. Output only this exact envelope, with a one-line title and ordinary unescaped Markdown between the tags: <article_title>Title</article_title><article_markdown>Markdown body</article_markdown>. Do not add a Markdown H1 because the page template supplies the single H1. Do not add a code fence, preface, or text outside the envelope. Include a direct answer near the start, 2+ concrete question-or-decision H2s, an actionable checklist, at least one supplied internal blog link, and a bounded free-scan CTA.`,
        prompt: `GEO-Pulse product context: GEO-Pulse measures public website readiness signals and helps a business decide what to verify, fix, and remeasure. It does not guarantee inclusion or citations in any AI answer.\nTopic: ${topic}\nApproved internal links (use only these): /ai-visibility-audit, /blog/msp-service-claims-verifiable-evidence, /solutions/msps, /\nVerified official sources (cite only factual statements they directly support):\n${trustedSources}\nAvoid duplicate intent with: ${existingTitles.slice(0, 50).join(' | ')}` });
      if (!result.ok) {
        return {
          title: '',
          markdown: '',
          sources: [],
          providerFailure: safeWriterProviderFailure(result.reason),
        };
      }
      const parsed = editorialDraftFromModel(result.text);
      const title = parsed?.title ?? '';
      const markdown = parsed?.markdown
        ? normalizeGeneratedEditorialMarkdown(parsed.markdown)
        : '';
      return {
        title,
        markdown,
        sources: TRUSTED_EDITORIAL_SOURCES.map((source) => source.url),
        ...(!parsed
          ? { providerFailure: 'writer_contract_parse_failed' }
          : !title || !markdown
            ? { providerFailure: 'writer_json_incomplete' }
            : {}),
      };
    },
    async hero({ title, allowGenerated }) {
      const key = env.OPENAI_API_KEY?.trim(); const base = env.EDITORIAL_HERO_PUBLIC_BASE?.replace(/\/$/, ''); const bucket = env.REPORT_FILES;
      if (!allowGenerated) return deterministicHero(env, env.OPENAI_API_KEY ? 'openai_spend_cap' : 'openai_not_configured');
      if (!key || !base || !bucket) return deterministicHero(env, 'openai_not_configured');
      try {
        const response = await fetchImpl('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: env.OPENAI_IMAGE_MODEL || 'gpt-image-1', size: '1024x1024', n: 1, output_format: 'jpeg', quality: 'high', prompt: `Square editorial image that works as both a blog hero and an Instagram feed post. Keep the full visual idea inside the central 80% safe area so no important element is cropped. No text, no letters, no logos, no robots, and no glowing AI icons. Warm off-white paper, charcoal ink, restrained antique gold, sophisticated magazine collage. Topic: ${title}. Show the idea through clear documents, systems, or evidence.` }), signal: AbortSignal.timeout(60_000) });
        if (!response.ok) {
          const payload = await response.json().catch(() => null) as { error?: { code?: unknown; type?: unknown } } | null;
          const providerCode = safeProviderCode(payload?.error?.code ?? payload?.error?.type);
          return deterministicHero(env, `openai_http_${response.status}${providerCode ? `_${providerCode}` : ''}`);
        }
        const payload = await response.json() as { data?: Array<{ b64_json?: string }> }; const encoded = payload.data?.[0]?.b64_json;
        if (!encoded) return deterministicHero(env, 'openai_missing_image_payload');
        const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)); const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);
        const objectKey = `editorial-heroes/${slug}-${Date.now()}.jpg`; await bucket.put(objectKey, bytes.buffer, { httpMetadata: { contentType: 'image/jpeg' } });
        return { url: `${base}/${objectKey}`, alt: CLEAN_EDITORIAL_HERO_ALT, provider: 'openai' as const };
      } catch (error) {
        const reason = error instanceof DOMException && error.name === 'TimeoutError'
          ? 'timeout'
          : error instanceof Error ? safeProviderCode(error.name) || 'request_failed' : 'request_failed';
        return deterministicHero(env, `openai_${reason}`);
      }
    },
    async review({ title, markdown, sources, hero }) {
      if (!hero.url.startsWith('https://') || /\b(ai|robot|future|innovation)\b/i.test(hero.alt) || sources.length === 0) return { approved: false, reasons: ['hero or sources fail policy'] };
      if (/\bgeographic (?:audience|region)|\blocal search terms?\b|\blocation-specific keywords?\b|\btarget location\b/i.test(`${title}\n${markdown}`)) {
        return { approved: false, reasons: ['GEO was misinterpreted as geographic or local-search optimization'] };
      }
      const result = await runWorkersAiPrompt({ ai: env.AI, model: env.EDITORIAL_REVIEWER_MODEL, maxTokens: 600, system: 'Review GEO-Pulse content about generative engine optimization and AI-search visibility. GEO means generative engine optimization, never geographic optimization. Reject unsupported claims, generic AI buzzwords, duplicated intent, missing internal links, misleading source use, or content that drifts into local/geographic SEO. Output JSON only: {"approved":boolean,"reasons":[""]}.', prompt: `TITLE: ${title}\nSOURCES: ${sources.join('\n')}\nDRAFT:\n${markdown}` });
      if (!result.ok) return { approved: false, reasons: [result.reason] };
      const json = jsonFromModel(result.text); return { approved: json?.approved === true, reasons: Array.isArray(json?.reasons) ? json.reasons.filter((v): v is string => typeof v === 'string') : ['review_parse_failed'] };
    },
  };
}
