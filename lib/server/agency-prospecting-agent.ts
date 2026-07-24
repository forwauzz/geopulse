import { z } from 'zod';
import type { SupabaseClient } from '@supabase/supabase-js';
import { importContacts } from './outreach-contacts';

export type AgencyProspectingEnv = {
  readonly GEMINI_API_KEY?: string;
  readonly GEMINI_MODEL?: string;
  readonly GEMINI_ENDPOINT?: string;
  readonly AGENCY_PROSPECTING_GEMINI_MODEL?: string;
};

export type AgencyProspectingResult = {
  readonly status: 'completed' | 'skipped';
  readonly discovered: number;
  readonly qualified: number;
  readonly saved: number;
  readonly reason?: string;
};

const resultSchema = z.object({
  agencies: z.array(z.object({
    name: z.string().min(1).max(120),
    url: z.string().url(),
  })).max(20),
});

const BLOCKED_EMAIL_PREFIXES = ['noreply', 'no-reply', 'privacy', 'abuse', 'legal', 'billing'];
const PREFERRED_EMAIL_PREFIXES = ['partnerships', 'growth', 'marketing', 'hello', 'info', 'contact'];

export function parseAgencyDiscovery(raw: string): { name: string; url: string }[] {
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  try {
    const parsed = resultSchema.safeParse(JSON.parse(cleaned.slice(start, end + 1)));
    if (!parsed.success) return [];
    const seen = new Set<string>();
    return parsed.data.agencies.filter((agency) => {
      const domain = new URL(agency.url).hostname.replace(/^www\./, '').toLowerCase();
      if (!domain || seen.has(domain)) return false;
      seen.add(domain);
      return true;
    });
  } catch {
    return [];
  }
}

export function resolveAgencyProspectingModel(env: AgencyProspectingEnv): string {
  // The platform-wide scan model can be a Flash Lite preview that does not
  // support Google Search grounding. Prospecting needs a grounded-capable model.
  return env.AGENCY_PROSPECTING_GEMINI_MODEL?.trim() || 'gemini-2.5-flash';
}

export function selectPublicBusinessEmail(html: string, websiteUrl: string): string | null {
  if (/do not (?:send|email).{0,40}(?:marketing|solicitation)|no unsolicited/i.test(html)) return null;
  const siteDomain = new URL(websiteUrl).hostname.replace(/^www\./, '').toLowerCase();
  const matches = Array.from(
    html.matchAll(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}/gi),
    (match) => match[0].toLowerCase().replace(/[),.;:]+$/, '')
  );
  const eligible = [...new Set(matches)].filter((email) => {
    const [prefix, domain] = email.split('@');
    if (!prefix || !domain || BLOCKED_EMAIL_PREFIXES.some((blocked) => prefix.startsWith(blocked))) return false;
    return domain === siteDomain || domain.endsWith(`.${siteDomain}`);
  });
  return eligible.sort((a, b) => {
    const aRank = PREFERRED_EMAIL_PREFIXES.findIndex((prefix) => a.startsWith(`${prefix}@`));
    const bRank = PREFERRED_EMAIL_PREFIXES.findIndex((prefix) => b.startsWith(`${prefix}@`));
    return (aRank < 0 ? 99 : aRank) - (bRank < 0 ? 99 : bRank);
  })[0] ?? null;
}

function contactUrls(homeUrl: string, html: string): string[] {
  const home = new URL(homeUrl);
  const urls = new Set<string>([home.toString()]);
  for (const match of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    try {
      const url = new URL(match[1]!, home);
      if (url.origin === home.origin && /contact|about|team/i.test(url.pathname)) urls.add(url.toString());
    } catch {
      // Ignore malformed links.
    }
    if (urls.size >= 3) break;
  }
  return [...urls];
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'GEO-Pulse-Prospecting/1.0 (+https://getgeopulse.com)' },
      redirect: 'follow',
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('text/html')) return null;
    return (await response.text()).slice(0, 500_000);
  } catch {
    return null;
  }
}

async function discoverAgencies(
  env: AgencyProspectingEnv,
  market: string,
  limit: number
): Promise<
  | { ok: true; agencies: { name: string; url: string }[] }
  | { ok: false; reason: string }
> {
  const key = env.GEMINI_API_KEY?.trim();
  if (!key) return { ok: false, reason: 'gemini_api_key_missing' };
  const model = resolveAgencyProspectingModel(env);
  const base = (env.GEMINI_ENDPOINT?.trim() || 'https://generativelanguage.googleapis.com/v1beta/models').replace(/\/$/, '');
  const prompt = [
    `Use Google Search to find ${String(limit)} independent digital marketing, SEO, or web agencies in ${market}.`,
    'Return agencies with an official website. Exclude directories, freelancers without a business site, closed businesses, and duplicates.',
    'Return only JSON: {"agencies":[{"name":"Agency name","url":"https://official-site.example/"}]}',
  ].join('\n');
  const response = await fetch(`${base}/${model}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1400 },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) return { ok: false, reason: `gemini_http_${String(response.status)}` };
  const data = await response.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const agencies = parseAgencyDiscovery(
    data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? '').join('') ?? ''
  );
  return agencies.length > 0
    ? { ok: true, agencies }
    : { ok: false, reason: 'gemini_no_agencies_parsed' };
}

export async function runAgencyProspectingAgent(args: {
  readonly supabase: SupabaseClient;
  readonly env: AgencyProspectingEnv;
  readonly market: string;
  readonly dailyCap: number;
}): Promise<AgencyProspectingResult> {
  if (!args.env.GEMINI_API_KEY?.trim()) {
    return { status: 'skipped', discovered: 0, qualified: 0, saved: 0, reason: 'gemini_api_key_missing' };
  }
  const cap = Math.max(1, Math.min(10, Math.floor(args.dailyCap)));
  const discovery = await discoverAgencies(args.env, args.market, cap * 2);
  if (!discovery.ok) {
    return {
      status: 'skipped',
      discovered: 0,
      qualified: 0,
      saved: 0,
      reason: discovery.reason,
    };
  }
  const candidates = discovery.agencies;
  const rows: { email: string; url: string; name: null; company: string; city: string }[] = [];

  for (const candidate of candidates) {
    if (rows.length >= cap) break;
    const home = await fetchHtml(candidate.url);
    if (!home) continue;
    let email: string | null = null;
    for (const url of contactUrls(candidate.url, home)) {
      const html = url === candidate.url ? home : await fetchHtml(url);
      if (html) email = selectPublicBusinessEmail(html, candidate.url);
      if (email) break;
    }
    if (email) rows.push({ email, url: candidate.url, name: null, company: candidate.name, city: args.market });
  }

  const emails = rows.map((row) => row.email);
  const { data: existingRows } = emails.length > 0
    ? await args.supabase.from('outreach_contacts').select('email').in('email', emails)
    : { data: [] };
  const existing = new Set(
    ((existingRows ?? []) as { email: string }[]).map((row) => row.email.toLowerCase())
  );
  const newRows = rows.filter((row) => !existing.has(row.email.toLowerCase()));
  const saved = await importContacts(args.supabase, newRows, {
    segment: 'marketing-agencies',
    tags: ['agency', 'public-business-email', 'agent-qualified'],
    source: 'gemini-grounded-search+official-website',
  });
  return {
    status: 'completed',
    discovered: candidates.length,
    qualified: rows.length,
    saved: saved.imported,
    ...(saved.error ? { reason: saved.error } : {}),
  };
}
