import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

type SupabaseLike = {
  from(table: string): any;
};

type DraftKind = 'article' | 'brief' | 'newsletter';

type DraftRecord = {
  readonly kind: DraftKind;
  readonly filename: string;
  readonly fullPath: string;
  readonly markdown: string;
};

type ImportGroup = {
  brief?: DraftRecord;
  article?: DraftRecord;
  newsletter?: DraftRecord;
};

export type ImportedContentItem = {
  readonly content_id: string;
  readonly slug: string;
  readonly title: string;
  readonly status: string;
  readonly content_type: string;
  readonly target_persona: string | null;
  readonly primary_problem: string | null;
  readonly topic_cluster: string | null;
  readonly keyword_cluster: string | null;
  readonly cta_goal: string;
  readonly source_type: string;
  readonly source_links: string[];
  readonly brief_markdown: string | null;
  readonly draft_markdown: string | null;
  readonly metadata: Record<string, unknown>;
};

const DRAFTS_DIR = path.join(process.cwd(), 'PLAYBOOK', 'content-machine-drafts');

function stripDatePrefix(value: string): string {
  return value.replace(/^\d{4}-\d{2}-\d{2}-/, '');
}

function parseDraftFilename(filename: string): { kind: DraftKind; baseSlug: string } | null {
  if (filename.endsWith('-article.md')) {
    return { kind: 'article', baseSlug: stripDatePrefix(filename.replace(/-article\.md$/, '')) };
  }
  if (filename.endsWith('-brief.md')) {
    return { kind: 'brief', baseSlug: stripDatePrefix(filename.replace(/-brief\.md$/, '')) };
  }
  if (filename.endsWith('-newsletter.md')) {
    return {
      kind: 'newsletter',
      baseSlug: stripDatePrefix(filename.replace(/-newsletter\.md$/, '')),
    };
  }
  return null;
}

function extractTitle(markdown: string): string | null {
  const match = markdown.match(/^#\s+(.+)$/m);
  const value = match?.[1];
  return value ? value.trim() : null;
}

function extractBriefField(markdown: string, field: string): string | null {
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = markdown.match(new RegExp(`^-\\s+${escaped}:\\s+(.+)$`, 'mi'));
  const value = match?.[1];
  return value ? value.trim() : null;
}

function extractNewsletterSubject(markdown: string): string | null {
  const lines = markdown.split(/\r?\n/);
  const subjectHeadingIndex = lines.findIndex((line) => line.trim() === '## Subject ideas');
  if (subjectHeadingIndex < 0) return null;

  for (let i = subjectHeadingIndex + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line) continue;
    const trimmedLine = line.trim();
    if (trimmedLine.startsWith('## ')) break;
    if (trimmedLine.startsWith('- ')) {
      const value = trimmedLine.slice(2);
      return value ? value.trim() : null;
    }
  }
  return null;
}

function humanizeSlug(slug: string): string {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function buildImportedContentItems(groups: Map<string, ImportGroup>): ImportedContentItem[] {
  const imported: ImportedContentItem[] = [];

  for (const [baseSlug, group] of groups.entries()) {
    const articleTitle =
      (group.brief ? extractBriefField(group.brief.markdown, 'working title') : null) ??
      (group.article ? extractTitle(group.article.markdown) : null) ??
      humanizeSlug(baseSlug);

    const targetPersona = group.brief
      ? extractBriefField(group.brief.markdown, 'target persona')
      : null;
    const primaryProblem = group.brief ? extractBriefField(group.brief.markdown, 'core problem') : null;
    const ctaGoal = group.brief
      ? ((extractBriefField(group.brief.markdown, 'primary CTA') ?? 'free scan')
          .toLowerCase()
          .replace(/\s+/g, '_') as ImportedContentItem['cta_goal'])
      : 'free_scan';

    if (group.brief) {
      imported.push({
        content_id: `${baseSlug}-brief`,
        slug: `${baseSlug}-brief`,
        title: `Brief: ${articleTitle}`,
        status: 'brief',
        content_type: 'brief',
        target_persona: targetPersona,
        primary_problem: primaryProblem,
        topic_cluster: baseSlug.replace(/-/g, '_'),
        keyword_cluster: null,
        cta_goal: ctaGoal,
        source_type: 'internal_plus_research',
        source_links: [path.relative(process.cwd(), group.brief.fullPath).replace(/\\/g, '/')],
        brief_markdown: group.brief.markdown,
        draft_markdown: null,
        metadata: { imported_from_playbook: true, draft_kind: 'brief' },
      });
    }

    if (group.article) {
      imported.push({
        content_id: `${baseSlug}-article`,
        slug: baseSlug,
        title: articleTitle,
        status: 'draft',
        content_type: 'article',
        target_persona: targetPersona,
        primary_problem: primaryProblem,
        topic_cluster: baseSlug.replace(/-/g, '_'),
        keyword_cluster: null,
        cta_goal: ctaGoal,
        source_type: 'internal_plus_research',
        source_links: [path.relative(process.cwd(), group.article.fullPath).replace(/\\/g, '/')],
        brief_markdown: group.brief?.markdown ?? null,
        draft_markdown: group.article.markdown,
        metadata: { imported_from_playbook: true, draft_kind: 'article' },
      });
    }

    if (group.newsletter) {
      imported.push({
        content_id: `${baseSlug}-newsletter`,
        slug: `${baseSlug}-newsletter`,
        title: extractNewsletterSubject(group.newsletter.markdown) ?? `${articleTitle} Newsletter`,
        status: 'draft',
        content_type: 'newsletter',
        target_persona: targetPersona,
        primary_problem: primaryProblem,
        topic_cluster: baseSlug.replace(/-/g, '_'),
        keyword_cluster: null,
        cta_goal: ctaGoal,
        source_type: 'internal_plus_research',
        source_links: [path.relative(process.cwd(), group.newsletter.fullPath).replace(/\\/g, '/')],
        brief_markdown: group.brief?.markdown ?? null,
        draft_markdown: group.newsletter.markdown,
        metadata: { imported_from_playbook: true, draft_kind: 'newsletter' },
      });
    }
  }

  return imported;
}

export async function loadDraftGroupsFromPlaybook(): Promise<Map<string, ImportGroup>> {
  const files = await readdir(DRAFTS_DIR);
  const groups = new Map<string, ImportGroup>();

  await Promise.all(
    files.map(async (filename) => {
      const parsed = parseDraftFilename(filename);
      if (!parsed) return;

      const fullPath = path.join(DRAFTS_DIR, filename);
      const markdown = await readFile(fullPath, 'utf8');
      const record: DraftRecord = {
        kind: parsed.kind,
        filename,
        fullPath,
        markdown,
      };

      const existing = groups.get(parsed.baseSlug) ?? {};
      existing[parsed.kind] = record;
      groups.set(parsed.baseSlug, existing);
    })
  );

  return groups;
}

export async function importPlaybookDrafts(
  supabase: SupabaseLike,
  currentUserId?: string | null
): Promise<{ importedCount: number; items: ImportedContentItem[] }> {
  const groups = await loadDraftGroupsFromPlaybook();
  const items = buildImportedContentItems(groups);

  for (const item of items) {
    const { data: existingRows, error: selectError } = await supabase
      .from('content_items')
      .select('id')
      .eq('content_id', item.content_id)
      .limit(1);

    if (selectError) throw selectError;

    const existing = ((existingRows ?? []) as Array<{ id: string }>)[0] ?? null;

    const payload = {
      content_id: item.content_id,
      slug: item.slug,
      title: item.title,
      status: item.status,
      content_type: item.content_type,
      target_persona: item.target_persona,
      primary_problem: item.primary_problem,
      topic_cluster: item.topic_cluster,
      keyword_cluster: item.keyword_cluster,
      cta_goal: item.cta_goal,
      source_type: item.source_type,
      source_links: item.source_links,
      brief_markdown: item.brief_markdown,
      draft_markdown: item.draft_markdown,
      metadata: item.metadata,
      created_by_user_id: currentUserId ?? null,
    };

    const mutation = existing
      ? supabase.from('content_items').update(payload).eq('content_id', item.content_id)
      : supabase.from('content_items').insert(payload);

    const { error: mutationError } = await mutation;
    if (mutationError) throw mutationError;
  }

  return { importedCount: items.length, items };
}
