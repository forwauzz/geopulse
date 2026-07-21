/**
 * Fix Agent — the first user-facing agent (assignable per-user via the `fix_agent` grant).
 *
 * Takes the user's most recent audit, hands the failed checks to the free Workers AI brain, and
 * returns concrete, copy-paste fixes (the exact tag / snippet to add) instead of generic advice.
 * Deterministic input, bounded output; never throws.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { runWorkersAiPrompt, STRUCTURED_WORKERS_AI_MODEL, type WorkersAiBinding } from './workers-ai';

export type AgentFix = {
  /** Short title of what to change. */
  title: string;
  /** Why it matters, in plain language. */
  why: string;
  /** The literal thing to paste / change. */
  snippet: string;
  /** Where it goes, e.g. "<head> of every page". */
  where: string;
};

export type FixAgentResult =
  | { ok: true; fixes: AgentFix[]; model: string; scanId: string; domain: string; score: number | null }
  | { ok: false; reason: string };

type ScanIssue = { check?: string; finding?: string; fix?: string; passed?: boolean; category?: string; weight?: number };

/** Latest scan for a user (any source), with its issues and the audited page's own text. */
export async function loadLatestScanForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<{
  id: string;
  domain: string;
  url: string;
  score: number | null;
  issues: ScanIssue[];
  pageSample: string;
} | null> {
  try {
    const { data } = await supabase
      .from('scans')
      .select('id, domain, url, score, issues_json, full_results_json')
      .eq('user_id', userId)
      .eq('status', 'complete')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const issues = Array.isArray(data.issues_json) ? (data.issues_json as ScanIssue[]) : [];
    const fullResults = data.full_results_json as Record<string, unknown> | null;
    const pageSample =
      fullResults && typeof fullResults['pageSample'] === 'string' ? (fullResults['pageSample'] as string) : '';
    return {
      id: data.id as string,
      domain: (data.domain as string) ?? '',
      url: (data.url as string) ?? '',
      score: (data.score as number | null) ?? null,
      issues,
      pageSample,
    };
  } catch {
    return null;
  }
}

/** The failed checks, worst-impact first, bounded for a tight prompt. */
export function selectFixableIssues(issues: ScanIssue[], max = 6): ScanIssue[] {
  return issues
    .filter((i) => i.passed === false)
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, max);
}

/**
 * Cap for the page-content section of the prompt. The stored sample is already bounded; this keeps
 * the prompt tight even if a caller passes something larger.
 */
const PROMPT_PAGE_SAMPLE_MAX = 4000;

export function buildFixAgentPrompt(domain: string, issues: ScanIssue[], pageSample?: string): string {
  const list = issues
    .map((i, n) => `${n + 1}. ${i.check ?? 'Check'} — problem: ${i.finding ?? 'n/a'}${i.fix ? ` — suggested: ${i.fix}` : ''}`)
    .join('\n');
  const sample = pageSample?.trim().slice(0, PROMPT_PAGE_SAMPLE_MAX) ?? '';
  return [
    `You are a senior technical SEO engineer fixing ${domain} so AI answer engines can crawl, understand and cite it.`,
    '',
    // Without the page's own words, models asked to write "facts" about the site infer them from
    // the domain name (e.g. "geopulse" → geospatial analytics). The audited content is the only
    // source of truth about what this business actually is.
    ...(sample
      ? [
          'Text content of the audited page — this is the ONLY source of truth about what this site/business is. Every factual claim in your fixes (product descriptions, FAQ answers, organization details) must come from it. If the page does not state a fact, do not invent it; use a neutral phrasing or a clearly marked placeholder instead.',
          '---',
          sample,
          '---',
          '',
        ]
      : []),
    'Failed checks from the audit:',
    list,
    '',
    'For EACH item, give the exact change to make — real, valid, copy-pasteable code (HTML tag, JSON-LD block, header, or robots directive). No placeholders like "your title here" unless unavoidable; take names, descriptions and facts from the page content above' +
      (sample ? '.' : ', or keep them neutral when unknown.'),
    'Respond with ONLY a JSON object, no prose, no markdown fences:',
    '{ "fixes": [ { "title": "...", "why": "one plain sentence", "where": "e.g. <head> of every page", "snippet": "the exact code to paste" } ] }',
  ].join('\n');
}

/** Parse + validate the model output into bounded fixes. */
export function parseFixAgentResponse(raw: string): AgentFix[] {
  const cleaned = raw.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return [];
  }
  const fixes = (parsed as { fixes?: unknown }).fixes;
  if (!Array.isArray(fixes)) return [];
  const out: AgentFix[] = [];
  for (const f of fixes) {
    if (!f || typeof f !== 'object') continue;
    const r = f as Record<string, unknown>;
    const title = typeof r['title'] === 'string' ? r['title'].trim() : '';
    const snippet = typeof r['snippet'] === 'string' ? r['snippet'].trim() : '';
    if (!title || !snippet) continue;
    out.push({
      title: title.slice(0, 140),
      why: (typeof r['why'] === 'string' ? r['why'].trim() : '').slice(0, 300),
      where: (typeof r['where'] === 'string' ? r['where'].trim() : '').slice(0, 140),
      snippet: snippet.slice(0, 4000),
    });
    if (out.length >= 8) break;
  }
  return out;
}

/** Run the agent for a user's latest audit. */
export async function runFixAgent(args: {
  supabase: SupabaseClient;
  ai: WorkersAiBinding | undefined;
  userId: string;
  model?: string;
}): Promise<FixAgentResult> {
  const scan = await loadLatestScanForUser(args.supabase, args.userId);
  if (!scan) return { ok: false, reason: 'no_scan' };

  const issues = selectFixableIssues(scan.issues);
  if (issues.length === 0) return { ok: false, reason: 'nothing_to_fix' };

  const res = await runWorkersAiPrompt({
    ai: args.ai,
    prompt: buildFixAgentPrompt(scan.domain || scan.url, issues, scan.pageSample),
    system: 'You output only valid JSON. You are precise and never invent facts about the site.',
    // Structured output → Hermes (JSON-mode tuned); prose stays on the default 70B model.
    model: args.model ?? STRUCTURED_WORKERS_AI_MODEL,
    maxTokens: 3000,
    temperature: 0.2,
  });
  if (!res.ok) return { ok: false, reason: res.reason };

  const fixes = parseFixAgentResponse(res.text);
  if (fixes.length === 0) return { ok: false, reason: 'no_fixes_parsed' };

  return { ok: true, fixes, model: res.model, scanId: scan.id, domain: scan.domain || scan.url, score: scan.score };
}
