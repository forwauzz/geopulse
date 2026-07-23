import type { EditorialProvider } from './autonomous-editorial-engine';
import { runWorkersAiPrompt, type WorkersAiBinding } from './workers-ai';

type R2Bucket = { put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown> };
type FetchLike = typeof fetch;

export type AutonomousEditorialEnv = {
  readonly AI?: WorkersAiBinding;
  readonly OPENAI_API_KEY?: string;
  readonly OPENAI_IMAGE_MODEL?: string;
  readonly EDITORIAL_HERO_PUBLIC_BASE?: string;
  readonly EDITORIAL_WRITER_MODEL?: string;
  readonly EDITORIAL_REVIEWER_MODEL?: string;
  readonly REPORT_FILES?: R2Bucket;
};

export const CLEAN_EDITORIAL_HERO_ALT =
  'Editorial collage of documents, evidence, and connected systems on warm paper';

function jsonFromModel(text: string): Record<string, unknown> | null {
  try { const value = JSON.parse(text); return value && typeof value === 'object' ? value as Record<string, unknown> : null; } catch { return null; }
}

export function createAutonomousEditorialProvider(env: AutonomousEditorialEnv, fetchImpl: FetchLike = fetch): EditorialProvider {
  return {
    async draft({ topic, existingTitles }) {
      const result = await runWorkersAiPrompt({ ai: env.AI, model: env.EDITORIAL_WRITER_MODEL, maxTokens: 3500,
        system: 'You write source-backed GEO-Pulse blog drafts. Never promise rankings. Output JSON only: {"title":"","markdown":"","sources":["https://..."]}. Include 2+ H2s, a direct answer, internal /blog links, and a bounded free-scan CTA.',
        prompt: `Topic: ${topic}\nAvoid duplicate intent with: ${existingTitles.slice(0, 50).join(' | ')}` });
      if (!result.ok) return { title: '', markdown: '', sources: [] };
      const json = jsonFromModel(result.text);
      const title = typeof json?.title === 'string' ? json.title.trim() : '';
      const markdown = typeof json?.markdown === 'string' ? json.markdown.trim() : '';
      const sources = Array.isArray(json?.sources) ? json.sources.filter((v): v is string => typeof v === 'string' && /^https:\/\//.test(v)) : [];
      return { title, markdown, sources };
    },
    async hero({ title, markdown }) {
      const key = env.OPENAI_API_KEY?.trim(); const base = env.EDITORIAL_HERO_PUBLIC_BASE?.replace(/\/$/, ''); const bucket = env.REPORT_FILES;
      if (!key || !base || !bucket) return null;
      const response = await fetchImpl('https://api.openai.com/v1/images/generations', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` }, body: JSON.stringify({ model: env.OPENAI_IMAGE_MODEL || 'gpt-image-1', size: '1536x1024', n: 1, output_format: 'jpeg', quality: 'high', prompt: `Editorial blog hero, no text, no logos, no robots, no glowing AI icons. Warm off-white paper, charcoal ink, restrained antique gold, sophisticated magazine collage. Topic: ${title}. Show the idea through clear documents, systems, or evidence. Never include words or letters.` }), signal: AbortSignal.timeout(60_000) });
      if (!response.ok) return null;
      const payload = await response.json() as { data?: Array<{ b64_json?: string }> }; const encoded = payload.data?.[0]?.b64_json;
      if (!encoded) return null;
      const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0)); const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80);
      const objectKey = `editorial-heroes/${slug}-${Date.now()}.jpg`; await bucket.put(objectKey, bytes.buffer, { httpMetadata: { contentType: 'image/jpeg' } });
      return { url: `${base}/${objectKey}`, alt: CLEAN_EDITORIAL_HERO_ALT };
    },
    async review({ title, markdown, sources, hero }) {
      if (!hero.url.startsWith('https://') || /\b(ai|robot|future|innovation)\b/i.test(hero.alt) || sources.length === 0) return { approved: false, reasons: ['hero or sources fail policy'] };
      const result = await runWorkersAiPrompt({ ai: env.AI, model: env.EDITORIAL_REVIEWER_MODEL, maxTokens: 600, system: 'Review GEO-Pulse content. Reject unsupported claims, generic AI buzzwords, duplicated intent, missing internal links, or misleading source use. Output JSON only: {"approved":boolean,"reasons":[""]}.', prompt: `TITLE: ${title}\nSOURCES: ${sources.join('\n')}\nDRAFT:\n${markdown}` });
      if (!result.ok) return { approved: false, reasons: [result.reason] };
      const json = jsonFromModel(result.text); return { approved: json?.approved === true, reasons: Array.isArray(json?.reasons) ? json.reasons.filter((v): v is string => typeof v === 'string') : ['review_parse_failed'] };
    },
  };
}
