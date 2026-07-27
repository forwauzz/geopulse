import type { SocialTrendIdea } from './social-trend-agent';

type Db = { from(table: string): any };

export type PriyaIdeaChannel = 'google' | 'reddit' | 'twitter';

export type PriyaResearchIdea = {
  readonly channel: PriyaIdeaChannel;
  readonly title: string;
  readonly evidence: string;
  readonly recommendation: string;
  readonly sourceUrl: string;
  readonly sourceLabel: string;
  readonly replyDraft?: string | null;
  readonly audience?: string | null;
  readonly score?: number | null;
  readonly discoveredAt?: string | null;
};

function safeUrl(value: string): URL | null {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url : null;
  } catch {
    return null;
  }
}

export function classifyPriyaIdeaChannel(sourceUrl: string): PriyaIdeaChannel {
  const host = safeUrl(sourceUrl)?.hostname.replace(/^www\./, '').toLowerCase() ?? '';
  if (host === 'reddit.com' || host.endsWith('.reddit.com')) return 'reddit';
  if (host === 'x.com' || host.endsWith('.x.com') || host === 'twitter.com' || host.endsWith('.twitter.com')) {
    return 'twitter';
  }
  return 'google';
}

function fingerprint(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function clean(value: string, max: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

export function socialTrendToPriyaIdea(idea: SocialTrendIdea): PriyaResearchIdea {
  const channel = classifyPriyaIdeaChannel(idea.sourceUrl);
  return {
    channel,
    title: clean(idea.title, 160),
    evidence: clean(`${idea.hook} ${idea.whyNow}`, 1_200),
    recommendation: clean(idea.angle, 1_200),
    sourceUrl: idea.sourceUrl,
    sourceLabel: clean(idea.sourceLabel, 160),
    replyDraft: idea.sourceType === 'community'
      ? clean(
          `${idea.caption}\n\nfull disclosure, i’m building geo-pulse around this problem, so i’m biased.`,
          1_500,
        )
      : null,
    audience: idea.audience,
    score: idea.score,
    discoveredAt: idea.discoveredAt,
  };
}

export async function upsertPriyaResearchIdeas(
  db: Db,
  ideas: readonly PriyaResearchIdea[],
  now = new Date(),
): Promise<number> {
  let saved = 0;
  for (const idea of ideas.slice(0, 30)) {
    const source = safeUrl(idea.sourceUrl);
    const title = clean(idea.title, 160);
    if (!source || !title) continue;
    const channel = idea.channel || classifyPriyaIdeaChannel(source.toString());
    const opportunityKey = `research:${channel}:${fingerprint(`${source.toString()}|${title.toLowerCase()}`)}`;
    const priority = Number(idea.score ?? 0) >= 75 ? 1 : Number(idea.score ?? 0) >= 55 ? 2 : 3;
    const payload = {
      opportunity_key: opportunityKey,
      kind: 'content_gap',
      priority,
      title,
      evidence: clean(idea.evidence, 2_000),
      recommendation: clean(idea.recommendation, 2_000),
      metadata: {
        owner: 'Jordan',
        researched_by_agent: 'priya',
        research_channel: channel,
        source_url: source.toString(),
        source_label: clean(idea.sourceLabel, 160) || source.hostname,
        suggested_reply: clean(idea.replyDraft ?? '', 1_500) || null,
        audience: clean(idea.audience ?? 'both', 80),
        research_score: Number(idea.score ?? 0) || null,
        discovered_at: idea.discoveredAt || now.toISOString(),
        public_reply_requires_approval: channel === 'reddit' || channel === 'twitter',
        disclosure_required: channel === 'reddit' || channel === 'twitter',
      },
      last_seen_at: now.toISOString(),
    };
    const { data: existing } = await db
      .from('seo_opportunities')
      .select('id')
      .eq('opportunity_key', opportunityKey)
      .maybeSingle();
    if (existing?.id) {
      await db.from('seo_opportunities').update(payload).eq('id', existing.id);
      saved += 1;
      continue;
    }
    const { error } = await db.from('seo_opportunities').insert({
      ...payload,
      status: 'queued',
      first_seen_at: now.toISOString(),
    });
    if (!error) saved += 1;
  }
  return saved;
}
