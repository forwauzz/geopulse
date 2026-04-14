import { readFile } from 'node:fs/promises';
import path from 'node:path';

type SupabaseLike = {
  from(table: string): any;
};

type TopicIntent = 'definition' | 'implementation' | 'comparison' | 'checklist' | 'case_pattern';
type TopicBatch = 'batch_1' | 'batch_2' | 'batch_3';

type TopicRegistryTopic = {
  readonly intent: TopicIntent;
  readonly slug: string;
  readonly status: string;
  readonly planned_batch: TopicBatch;
};

type TopicRegistryPillar = {
  readonly pillar_id: string;
  readonly pillar_slug: string;
  readonly pillar_title: string;
  readonly topics: TopicRegistryTopic[];
};

type TopicRegistry = {
  readonly version: string;
  readonly updated_at: string;
  readonly pillars: TopicRegistryPillar[];
};

export type TopicRegistrySeedItem = {
  readonly content_id: string;
  readonly slug: string;
  readonly title: string;
  readonly status: 'brief';
  readonly content_type: 'article';
  readonly target_persona: null;
  readonly primary_problem: null;
  readonly topic_cluster: string;
  readonly keyword_cluster: string;
  readonly cta_goal: 'free_scan';
  readonly source_type: 'internal_plus_research';
  readonly source_links: string[];
  readonly brief_markdown: string;
  readonly draft_markdown: string;
  readonly metadata: Record<string, unknown>;
};

const TOPIC_REGISTRY_PATH = path.join(process.cwd(), 'docs', '13-topic-registry-v1.json');

function isTopicIntent(value: unknown): value is TopicIntent {
  return (
    value === 'definition' ||
    value === 'implementation' ||
    value === 'comparison' ||
    value === 'checklist' ||
    value === 'case_pattern'
  );
}

function isTopicBatch(value: unknown): value is TopicBatch {
  return value === 'batch_1' || value === 'batch_2' || value === 'batch_3';
}

function toTitleFromSlug(slug: string): string {
  return slug
    .split('-')
    .map((part) => {
      const upper = part.toUpperCase();
      if (upper === 'AI' || upper === 'LLM' || upper === 'SEO' || upper === 'GEO') return upper;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}

function toTopicCluster(pillarSlug: string): string {
  return pillarSlug.toLowerCase().replace(/-/g, '_');
}

function buildBriefMarkdown(
  title: string,
  pillarTitle: string,
  intent: TopicIntent,
  slug: string
): string {
  const intentLabel = intent.replace(/_/g, ' ');
  return `# Article Brief

## Asset
- type: article
- working title: ${title}
- pillar: ${pillarTitle}
- intent: ${intentLabel}
- registry slug: ${slug}

## Problem
- core problem: explain the practical operator problem this topic solves before writing the full draft

## CTA
- primary CTA: free_scan

## Source
- registry source: docs/13-topic-registry-v1.json
`;
}

function buildDraftMarkdown(title: string): string {
  return `# ${title}

## Direct answer
Write a concise direct answer first.

## Why this matters
Explain the operator impact in concrete terms.

## Practical steps
- Step 1
- Step 2
- Step 3
`;
}

export function parseTopicRegistry(rawJson: string): TopicRegistry {
  const parsed = JSON.parse(rawJson) as {
    version?: unknown;
    updated_at?: unknown;
    pillars?: unknown;
  };

  if (typeof parsed.version !== 'string' || typeof parsed.updated_at !== 'string') {
    throw new Error('Invalid topic registry header.');
  }

  if (!Array.isArray(parsed.pillars)) {
    throw new Error('Invalid topic registry pillars.');
  }

  const pillars: TopicRegistryPillar[] = parsed.pillars.map((pillar) => {
    if (!pillar || typeof pillar !== 'object') {
      throw new Error('Invalid topic registry pillar.');
    }

    const rawPillar = pillar as Record<string, unknown>;
    if (
      typeof rawPillar.pillar_id !== 'string' ||
      typeof rawPillar.pillar_slug !== 'string' ||
      typeof rawPillar.pillar_title !== 'string' ||
      !Array.isArray(rawPillar.topics)
    ) {
      throw new Error('Invalid topic registry pillar fields.');
    }

    const topics: TopicRegistryTopic[] = rawPillar.topics.map((topic) => {
      if (!topic || typeof topic !== 'object') {
        throw new Error('Invalid topic registry topic.');
      }

      const rawTopic = topic as Record<string, unknown>;
      if (
        !isTopicIntent(rawTopic.intent) ||
        typeof rawTopic.slug !== 'string' ||
        typeof rawTopic.status !== 'string' ||
        !isTopicBatch(rawTopic.planned_batch)
      ) {
        throw new Error('Invalid topic registry topic fields.');
      }

      return {
        intent: rawTopic.intent,
        slug: rawTopic.slug,
        status: rawTopic.status,
        planned_batch: rawTopic.planned_batch,
      };
    });

    return {
      pillar_id: rawPillar.pillar_id,
      pillar_slug: rawPillar.pillar_slug,
      pillar_title: rawPillar.pillar_title,
      topics,
    };
  });

  return {
    version: parsed.version,
    updated_at: parsed.updated_at,
    pillars,
  };
}

export function buildTopicRegistrySeedItems(
  registry: TopicRegistry,
  plannedBatch: TopicBatch
): TopicRegistrySeedItem[] {
  const items: TopicRegistrySeedItem[] = [];

  for (const pillar of registry.pillars) {
    for (const topic of pillar.topics) {
      if (topic.status !== 'planned') continue;
      if (topic.planned_batch !== plannedBatch) continue;

      const title = toTitleFromSlug(topic.slug);
      const topicCluster = toTopicCluster(pillar.pillar_slug);
      const contentId = `${topic.slug}-article`;
      items.push({
        content_id: contentId,
        slug: topic.slug,
        title,
        status: 'brief',
        content_type: 'article',
        target_persona: null,
        primary_problem: null,
        topic_cluster: topicCluster,
        keyword_cluster: `${topic.intent}_${plannedBatch}`,
        cta_goal: 'free_scan',
        source_type: 'internal_plus_research',
        source_links: ['docs/13-topic-registry-v1.json'],
        brief_markdown: buildBriefMarkdown(title, pillar.pillar_title, topic.intent, topic.slug),
        draft_markdown: buildDraftMarkdown(title),
        metadata: {
          seeded_from_topic_registry: true,
          topic_registry_version: registry.version,
          topic_registry_updated_at: registry.updated_at,
          topic_registry_pillar_id: pillar.pillar_id,
          topic_registry_pillar_slug: pillar.pillar_slug,
          topic_registry_pillar_title: pillar.pillar_title,
          topic_registry_intent: topic.intent,
          topic_registry_batch: topic.planned_batch,
          topic_registry_status: topic.status,
        },
      });
    }
  }

  return items;
}

export async function loadTopicRegistryFromDisk(): Promise<TopicRegistry> {
  const raw = await readFile(TOPIC_REGISTRY_PATH, 'utf8');
  return parseTopicRegistry(raw);
}

export async function seedTopicRegistryBatch(
  supabase: SupabaseLike,
  plannedBatch: TopicBatch,
  currentUserId?: string | null
): Promise<{
  readonly plannedBatch: TopicBatch;
  readonly candidateCount: number;
  readonly insertedCount: number;
  readonly skippedExistingCount: number;
}> {
  const registry = await loadTopicRegistryFromDisk();
  const candidates = buildTopicRegistrySeedItems(registry, plannedBatch);
  if (candidates.length === 0) {
    return {
      plannedBatch,
      candidateCount: 0,
      insertedCount: 0,
      skippedExistingCount: 0,
    };
  }

  const slugs = candidates.map((item) => item.slug);
  const contentIds = candidates.map((item) => item.content_id);

  const [existingBySlug, existingByContentId] = await Promise.all([
    supabase.from('content_items').select('slug').in('slug', slugs),
    supabase.from('content_items').select('content_id').in('content_id', contentIds),
  ]);

  if (existingBySlug.error) throw existingBySlug.error;
  if (existingByContentId.error) throw existingByContentId.error;

  const existingSlugSet = new Set<string>(
    ((existingBySlug.data ?? []) as Array<{ slug?: unknown }>)
      .map((row) => (typeof row.slug === 'string' ? row.slug : ''))
      .filter(Boolean)
  );
  const existingContentIdSet = new Set<string>(
    ((existingByContentId.data ?? []) as Array<{ content_id?: unknown }>)
      .map((row) => (typeof row.content_id === 'string' ? row.content_id : ''))
      .filter(Boolean)
  );

  const toInsert = candidates
    .filter(
      (candidate) =>
        !existingSlugSet.has(candidate.slug) && !existingContentIdSet.has(candidate.content_id)
    )
    .map((candidate) => ({
      ...candidate,
      created_by_user_id: currentUserId ?? null,
    }));

  if (toInsert.length > 0) {
    const { error } = await supabase.from('content_items').insert(toInsert);
    if (error) throw error;
  }

  return {
    plannedBatch,
    candidateCount: candidates.length,
    insertedCount: toInsert.length,
    skippedExistingCount: candidates.length - toInsert.length,
  };
}
