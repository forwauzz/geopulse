/**
 * Scheduled, fail-closed editorial orchestration.
 *
 * Providers are injected so the Worker can use Workers AI or OpenAI without
 * coupling content policy to a model vendor. A failed reviewer or missing hero
 * always leaves the item as a draft; it never publishes by accident.
 */
import { evaluateContentPublishChecks, prepareContentForPublish } from './content-publishing';
import { loadAutomationSetting } from './automation-settings';

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

  const { data: candidates, error } = await args.supabase
    .from('content_items')
    .select('content_id,slug,title,topic_cluster,metadata')
    .eq('content_type', 'article')
    .in('status', ['brief', 'draft'])
    .order('updated_at', { ascending: true })
    .limit(25);
  if (error) return { status: 'failed', reason: error.message };

  const candidate = (candidates ?? []).find((row: any) => row?.status === 'brief' || row?.metadata?.proposed_by === 'marketing_autopilot');
  if (!candidate?.content_id || !candidate.topic_cluster) return { status: 'skipped', reason: 'no_candidate' };

  const { data: existing } = await args.supabase.from('content_items').select('title').eq('content_type', 'article').limit(250);
  const draft = await args.provider.draft({ topic: candidate.topic_cluster, existingTitles: (existing ?? []).map((x: any) => String(x.title ?? '')) });
  if (!draft.title || !draft.markdown || draft.sources.length === 0) return { status: 'rejected', reason: 'incomplete_draft' };

  const hero = await args.provider.hero({ title: draft.title, markdown: draft.markdown });
  if (!hero?.url || !hero.alt) return { status: 'rejected', reason: 'missing_clean_hero' };

  const review = await args.provider.review({ title: draft.title, markdown: draft.markdown, sources: draft.sources, hero });
  if (!review.approved) return { status: 'rejected', reason: review.reasons.join('; ') || 'review_failed' };

  const metadata = { ...(candidate.metadata ?? {}), autonomous_editorial: { generated_at: (args.now ?? new Date()).toISOString(), reviewer: 'passed', hero_provider: 'generated' }, author_name: 'Geo Team', author_role: 'Editorial Team', author_url: 'https://getgeopulse.com/about', hero_image_url: hero.url, hero_image_alt: hero.alt };
  const checks = evaluateContentPublishChecks({ ...candidate, title: draft.title, status: 'draft', draft_markdown: draft.markdown, source_links: draft.sources, metadata });
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
  return updateError ? { status: 'failed', reason: updateError.message } : { status: 'created', contentId: candidate.content_id };
}
