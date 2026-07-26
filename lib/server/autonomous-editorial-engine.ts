/**
 * Scheduled, fail-closed editorial orchestration.
 *
 * Providers are injected so the Worker can use Workers AI or OpenAI without
 * coupling content policy to a model vendor. A failed reviewer or missing hero
 * always leaves the item as a draft; it never publishes by accident.
 */
import { evaluateContentPublishChecks, prepareContentForPublish } from './content-publishing';
import { configInt, loadAutomationSetting } from './automation-settings';
import {
  closeSatisfiedSeoParents,
  materializeSeoContentDerivatives,
  reconcileContentLoops,
} from './agent-loop-control';

type Db = { from(table: string): any };
export type EditorialProvider = {
  draft(input: { topic: string; existingTitles: string[] }): Promise<{ title: string; markdown: string; sources: string[] }>;
  hero(input: { title: string; markdown: string }): Promise<{ url: string; alt: string } | null>;
  review(input: { title: string; markdown: string; sources: string[]; hero: { url: string; alt: string } }): Promise<{ approved: boolean; reasons: string[] }>;
};

export type EditorialRunResult = { status: 'created' | 'skipped' | 'rejected' | 'failed'; reason?: string; contentId?: string };

export async function runAutonomousEditorialEngine(args: {
  supabase: Db;
  provider: EditorialProvider;
  now?: Date;
}): Promise<EditorialRunResult> {
  const setting = await loadAutomationSetting(args.supabase as any, 'marketing_autopilot');
  if (!setting.enabled || setting.killSwitch) return { status: 'skipped', reason: 'disabled_or_killed' };
  const now = args.now ?? new Date();
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dailyPublishCap = Math.min(Math.max(configInt(setting.config, 'daily_publish_cap', 2), 1), 5);
  const { data: publishedToday } = await args.supabase
    .from('content_items')
    .select('id')
    .eq('content_type', 'article')
    .eq('status', 'published')
    .gte('published_at', dayStart.toISOString())
    .limit(dailyPublishCap);
  if ((publishedToday ?? []).length >= dailyPublishCap) {
    return { status: 'skipped', reason: 'daily_publish_cap' };
  }

  const seoCandidatesResult = await args.supabase
    .from('content_items')
    .select('content_id,slug,title,status,topic_cluster,metadata,content_type,cta_goal,source_type,canonical_url,published_at,updated_at')
    .eq('content_type', 'article')
    .eq('metadata->>proposed_by', 'seo_agent')
    .in('status', ['brief', 'draft'])
    .order('updated_at', { ascending: true })
    .limit(25);
  if (seoCandidatesResult.error) return { status: 'failed', reason: seoCandidatesResult.error.message };

  const fallbackResult = seoCandidatesResult.data?.length
    ? { data: [], error: null }
    : await args.supabase
    .from('content_items')
    .select('content_id,slug,title,status,topic_cluster,metadata,content_type,cta_goal,source_type,canonical_url,published_at,updated_at')
    .eq('content_type', 'article')
    // Archived topic-registry items are deliberately excluded from the public site until this
    // engine replaces their thin planning seed with a source-backed editorial draft.
    .in('status', ['brief', 'draft', 'archived'])
    .order('updated_at', { ascending: true })
    .limit(25);
  if (fallbackResult.error) return { status: 'failed', reason: fallbackResult.error.message };
  const candidates = seoCandidatesResult.data?.length
    ? seoCandidatesResult.data
    : fallbackResult.data;

  const orderedCandidates = [...(candidates ?? [])].sort((left: any, right: any) => {
    const leftRetry = left?.metadata?.editorial_retry_required === true ? 0 : 1;
    const rightRetry = right?.metadata?.editorial_retry_required === true ? 0 : 1;
    if (leftRetry !== rightRetry) return leftRetry - rightRetry;
    const leftSeo = left?.metadata?.proposed_by === 'seo_agent' ? 0 : 1;
    const rightSeo = right?.metadata?.proposed_by === 'seo_agent' ? 0 : 1;
    return leftSeo - rightSeo;
  });
  const candidate = orderedCandidates.find((row: any) =>
    row?.status === 'brief' ||
    row?.metadata?.proposed_by === 'marketing_autopilot' ||
    // The registry cleanup predates the metadata marker on some rows. An archived article with
    // a topic is still safe to re-enter only through this full draft → hero → review → publish
    // sequence; it never revives the archived seed body directly.
    (row?.status === 'archived' && Boolean(row?.topic_cluster))
  );
  if (!candidate?.content_id || !candidate.topic_cluster) return { status: 'skipped', reason: 'no_candidate' };

  const { data: existing } = await args.supabase.from('content_items').select('title').eq('content_type', 'article').limit(250);
  const draft = await args.provider.draft({ topic: candidate.topic_cluster, existingTitles: (existing ?? []).map((x: any) => String(x.title ?? '')) });
  if (!draft.title || !draft.markdown || draft.sources.length === 0) return { status: 'rejected', reason: 'incomplete_draft' };

  const hero = await args.provider.hero({ title: draft.title, markdown: draft.markdown });
  if (!hero?.url || !hero.alt) return { status: 'rejected', reason: 'missing_clean_hero' };

  const review = await args.provider.review({ title: draft.title, markdown: draft.markdown, sources: draft.sources, hero });
  if (!review.approved) return { status: 'rejected', reason: review.reasons.join('; ') || 'review_failed' };

  const metadata = { ...(candidate.metadata ?? {}), editorial_retry_required: false, autonomous_editorial: { generated_at: now.toISOString(), reviewer: 'passed', hero_provider: 'generated' }, author_name: 'Geo Team', author_role: 'Editorial Team', author_url: 'https://getgeopulse.com/about', hero_image_url: hero.url, hero_image_alt: hero.alt };
  const checks = evaluateContentPublishChecks({
    ...candidate,
    content_type: 'article',
    title: draft.title,
    status: 'draft',
    draft_markdown: draft.markdown,
    source_links: draft.sources,
    canonical_url: candidate.slug ? `/blog/${candidate.slug}` : null,
    cta_goal: 'free_scan',
    source_type: 'autonomous_editorial',
    metadata,
    published_at: null,
  });
  const failures = checks.filter((check) => !check.passed);
  if (failures.length > 0) return { status: 'rejected', reason: failures.map((check) => check.hint ?? check.label).join('; ') };
  const publish = prepareContentForPublish({
    ...candidate,
    title: draft.title,
    status: 'published',
    draft_markdown: draft.markdown,
    source_links: draft.sources,
    canonical_url: candidate.slug ? `/blog/${candidate.slug}` : null,
    cta_goal: 'free_scan',
    source_type: 'autonomous_editorial',
    metadata,
    published_at: null,
  });
  const { error: updateError } = await args.supabase.from('content_items').update({ title: draft.title, draft_markdown: draft.markdown, source_links: draft.sources, status: 'published', canonical_url: publish.canonicalUrl, published_at: publish.publishedAt, metadata }).eq('content_id', candidate.content_id);
  if (updateError) return { status: 'failed', reason: updateError.message };
  const opportunityId = String(candidate.metadata?.seo_opportunity_id ?? '');
  if (opportunityId && publish.canonicalUrl) {
    await materializeSeoContentDerivatives({
      db: args.supabase,
      opportunityId,
      title: draft.title,
      markdown: draft.markdown,
      canonicalUrl: publish.canonicalUrl,
      now,
    });
  }
  await reconcileContentLoops(args.supabase, now);
  await closeSatisfiedSeoParents(args.supabase, now);
  return { status: 'created', contentId: candidate.content_id };
}
