/**
 * Fix Agent — the first user-facing agent (assignable per-user via the `fix_agent` grant).
 *
 * Takes the user's most recent audit, hands the failed checks to the free Workers AI brain, and
 * returns concrete, copy-paste fixes (the exact tag / snippet to add) instead of generic advice.
 * Deterministic input, bounded output; never throws.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { runWorkersAiPrompt, type WorkersAiBinding } from './workers-ai';

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

/** Latest scan for a user (any source), with its issues. */
export async function loadLatestScanForUser(
  supabase: SupabaseClient,
  userId: string
): Promise<{ id: string; domain: string; url: string; score: number | null; issues: ScanIssue[] } | null> {
  try {
    const { data } = await supabase
      .from('scans')
      .select('id, domain, url, score, issues_json')
      .eq('user_id', userId)
      .eq('status', 'complete')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!data) return null;
    const issues = Array.isArray(data.issues_json) ? (data.issues_json as ScanIssue[]) : [];
    return {
      id: data.id as string,
      domain: (data.domain as string) ?? '',
      url: (data.url as string) ?? '',
      score: (data.score as number | null) ?? null,
      issues,
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

export function buildFixAgentPrompt(domain: string, issues: ScanIssue[]): string {
  const list = issues
    .map((i, n) => `${n + 1}. ${i.check ?? 'Check'} — problem: ${i.finding ?? 'n/a'}${i.fix ? ` — suggested: ${i.fix}` : ''}`)
    .join('\n');
  return [
    `You are a senior technical SEO engineer fixing ${domain} so AI answer engines can crawl, understand and cite it.`,
    '',
    'Failed checks from the audit:',
    list,
    '',
    'For EACH item, give the exact change to make — real, valid, copy-pasteable code (HTML tag, JSON-LD block, header, or robots directive). No placeholders like "your title here" unless unavoidable; infer sensible values from the domain.',
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
    prompt: buildFixAgentPrompt(scan.domain || scan.url, issues),
    system: 'You output only valid JSON. You are precise and never invent facts about the site.',
    model: args.model,
    maxTokens: 3000,
    temperature: 0.2,
  });
  if (!res.ok) return { ok: false, reason: res.reason };

  const fixes = parseFixAgentResponse(res.text);
  if (fixes.length === 0) return { ok: false, reason: 'no_fixes_parsed' };

  return { ok: true, fixes, model: res.model, scanId: scan.id, domain: scan.domain || scan.url, score: scan.score };
}
