import { buildSeededTopicPageItem } from './content-topic-pages';

type SupabaseLike = {
  from(table: string): any;
};

export async function seedTopicPageItems(
  supabase: SupabaseLike,
  currentUserId?: string | null
): Promise<{ seededCount: number; topicKeys: string[] }> {
  const { data: articleRows, error: articleError } = await supabase
    .from('content_items')
    .select('topic_cluster')
    .eq('content_type', 'article');

  if (articleError) throw articleError;

  const topicKeys = Array.from(
    new Set(
      ((articleRows ?? []) as Array<{ topic_cluster?: string | null }>)
        .map((row) => row.topic_cluster?.trim())
        .filter((value): value is string => Boolean(value))
    )
  ).sort();

  for (const topicKey of topicKeys) {
    const item = buildSeededTopicPageItem(topicKey);
    const payload = {
      content_id: item.content_id,
      slug: item.slug,
      title: item.title,
      status: item.status,
      content_type: item.content_type,
      target_persona: null,
      primary_problem: null,
      topic_cluster: item.topic_cluster,
      keyword_cluster: null,
      cta_goal: item.cta_goal,
      source_type: item.source_type,
      source_links: [],
      brief_markdown: null,
      draft_markdown: null,
      metadata: item.metadata,
      published_at: new Date().toISOString(),
      created_by_user_id: currentUserId ?? null,
    };

    const { data: existingRows, error: selectError } = await supabase
      .from('content_items')
      .select('id')
      .eq('content_id', item.content_id)
      .limit(1);

    if (selectError) throw selectError;

    const existing = ((existingRows ?? []) as Array<{ id: string }>)[0] ?? null;
    const mutation = existing
      ? supabase
          .from('content_items')
          .update(payload)
          .eq('content_id', item.content_id)
      : supabase.from('content_items').insert(payload);

    const { error: mutationError } = await mutation;
    if (mutationError) throw mutationError;
  }

  return { seededCount: topicKeys.length, topicKeys };
}
