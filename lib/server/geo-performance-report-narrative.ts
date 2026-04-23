import { structuredLog } from './structured-log';
import type { GpmReportPayload } from './geo-performance-report-payload';

// ── Config ────────────────────────────────────────────────────────────────────

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_ENDPOINT = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_VERSION = '2023-06-01';

export type GpmNarrativeEnvLike = {
  readonly ANTHROPIC_API_KEY?: string;
  readonly GPM_NARRATIVE_MODEL?: string;
};

// ── Prompt builder (pure — testable) ─────────────────────────────────────────

function fmtPct(v: number): string {
  return `${Math.round(v * 100)}%`;
}

function platformLabel(platform: string): string {
  if (platform === 'chatgpt')    return 'ChatGPT';
  if (platform === 'gemini')     return 'Gemini';
  if (platform === 'perplexity') return 'Perplexity';
  return platform;
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

function formatWindow(w: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(w);
  if (m) {
    const month = MONTH_NAMES[parseInt(m[2]!, 10) - 1] ?? m[2]!;
    return `${month} ${m[1]!}`;
  }
  const wk = /^(\d{4})-W(\d+)$/.exec(w);
  if (wk) return `Week ${String(parseInt(wk[2]!, 10))} of ${wk[1]!}`;
  return w;
}

export function buildGpmNarrativePrompt(payload: GpmReportPayload): string {
  const {
    domain, topic, location, windowDate, platform,
    visibilityPct, citationRate, industryRank,
    prompts, opportunities, competitors,
  } = payload;

  const period = formatWindow(windowDate);
  const pl = platformLabel(platform);
  const citedCount = prompts.filter((p) => p.cited).length;
  const totalCount = prompts.length;

  // Top win: highest-ranked cited prompt (lowest rank number), or first cited
  const citedPrompts = prompts.filter((p) => p.cited);
  const topWin = citedPrompts.length > 0
    ? citedPrompts.reduce((best, p) => {
        if (best.rankPosition === null) return p;
        if (p.rankPosition === null) return best;
        return p.rankPosition < best.rankPosition ? p : best;
      })
    : null;

  // Top opportunity: first uncited prompt (already ordered by query set position)
  const topOpp = opportunities[0] ?? null;

  // Top competitor
  const topComp = competitors[0] ?? null;

  const rankNote = industryRank !== null
    ? `When cited, the domain appears at an average rank of ${String(Math.round(industryRank * 10) / 10)}.`
    : 'When cited, rank position data was insufficient to calculate an average.';

  const topWinNote = topWin
    ? `The strongest performing query was: "${topWin.queryText}"${topWin.rankPosition !== null ? ` (rank ${String(topWin.rankPosition)})` : ''}.`
    : 'No queries resulted in a citation this period.';

  const topOppNote = topOpp
    ? `The highest-priority uncited query is: "${topOpp.queryText}"${topOpp.topCompetitorInQuery ? ` — ${topOpp.topCompetitorInQuery} appeared in its place` : ''}.`
    : 'All tracked queries resulted in a citation — no opportunities to report.';

  const compNote = topComp
    ? `The most frequently co-cited competitor was ${topComp.name} (appeared in ${String(topComp.citationCount)} of ${String(totalCount)} queries).`
    : 'No competitor co-citations were detected this period.';

  return `You are writing the executive summary paragraph for a GEO Performance Monitoring report.

Report data:
- Domain: ${domain}
- Topic: ${topic}
- Location: ${location}
- Platform: ${pl}
- Period: ${period}
- AI Visibility: ${fmtPct(visibilityPct)} (${String(citedCount)} of ${String(totalCount)} queries cited this domain)
- Citation Rate: ${fmtPct(citationRate)}
- ${rankNote}
- ${topWinNote}
- ${topOppNote}
- ${compNote}

Write a 3–4 sentence executive summary paragraph for the client. Requirements:
1. Open with the headline visibility metric and period — make it feel like a real performance result.
2. Acknowledge the top win (best cited query or strongest rank) in one sentence.
3. Identify the top opportunity (the most impactful uncited query) and what competitor appeared instead, if known.
4. Close with one actionable recommendation relevant to the data.

Tone: professional, direct, data-informed. Avoid technical jargon — use "AI search" or "AI assistants" rather than LLM-specific terms. Write for a business owner or marketing lead, not a developer.

Output only the paragraph — no headers, no bullet points, no preamble.`;
}

// ── Claude API call ───────────────────────────────────────────────────────────

async function callClaudeMessages(args: {
  readonly apiKey: string;
  readonly model: string;
  readonly prompt: string;
}): Promise<string> {
  const res = await fetch(ANTHROPIC_ENDPOINT, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': args.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: 512,
      messages: [{ role: 'user', content: args.prompt }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Anthropic API error ${res.status}: ${body.slice(0, 200)}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };

  const textBlock = data.content?.find((b) => b.type === 'text');
  if (!textBlock?.text) throw new Error('No text block in Anthropic response.');
  return textBlock.text.trim();
}

// ── Public entry point ────────────────────────────────────────────────────────

export async function generateGpmNarrative(
  payload: GpmReportPayload,
  env: GpmNarrativeEnvLike
): Promise<string> {
  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is required for GPM narrative generation.');

  const model = env.GPM_NARRATIVE_MODEL?.trim() || DEFAULT_MODEL;
  const prompt = buildGpmNarrativePrompt(payload);

  structuredLog('gpm_narrative_generation_started', {
    config_id: payload.configId,
    domain: payload.domain,
    platform: payload.platform,
    window_date: payload.windowDate,
    model,
  });

  const narrative = await callClaudeMessages({ apiKey, model, prompt });

  structuredLog('gpm_narrative_generation_done', {
    config_id: payload.configId,
    domain: payload.domain,
    platform: payload.platform,
    window_date: payload.windowDate,
    char_count: narrative.length,
  });

  return narrative;
}
