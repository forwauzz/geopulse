import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import {
  PUBLIC_LEGACY_REDIRECTS,
  replacePublicLegacyMarkdownLinks,
} from '../lib/server/public-legacy-redirects';

const apply = process.argv.includes('--apply');
const url = process.env['NEXT_PUBLIC_SUPABASE_URL']?.trim();
const key = process.env['SUPABASE_SERVICE_ROLE_KEY']?.trim();

if (!url || !key) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.',
  );
}

const db = createClient(url, key, { auth: { persistSession: false } });

function fingerprint(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

async function main() {
  const { data: rows, error } = await db
    .from('content_items')
    .select('id,slug,title,status,draft_markdown,metadata,updated_at')
    .eq('status', 'published')
    .limit(1000);
  if (error) throw error;

  const { data: destinationRows, error: destinationError } = await db
    .from('content_items')
    .select('slug,status')
    .eq('status', 'published')
    .in(
      'slug',
      PUBLIC_LEGACY_REDIRECTS.map(
        (redirect) => redirect.destination.match(/^\/blog\/([^/]+)$/)?.[1],
      ).filter((slug): slug is string => Boolean(slug)),
    );
  if (destinationError) throw destinationError;

  const publishedDestinations = new Set(
    (destinationRows ?? []).map((row) => `/blog/${row.slug}`),
  );
  const changes = (rows ?? []).flatMap((row) => {
    const result = replacePublicLegacyMarkdownLinks(row.draft_markdown ?? '');
    if (result.replacements.length === 0) return [];
    for (const replacement of result.replacements) {
      if (
        replacement.destination.startsWith('/blog/') &&
        !publishedDestinations.has(replacement.destination)
      ) {
        throw new Error(
          `${row.slug}: destination is not published: ${replacement.destination}`,
        );
      }
    }
    return [
      {
        id: row.id,
        slug: row.slug,
        title: row.title,
        expectedUpdatedAt: row.updated_at,
        beforeHash: fingerprint({
          draft_markdown: row.draft_markdown,
          metadata: row.metadata,
        }),
        nextMarkdown: result.markdown,
        replacements: result.replacements,
        metadata:
          row.metadata && typeof row.metadata === 'object'
            ? (row.metadata as Record<string, unknown>)
            : {},
      },
    ];
  });

  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'preview',
        changedRows: changes.map(
          ({
            id,
            slug,
            title,
            expectedUpdatedAt,
            beforeHash,
            replacements,
          }) => ({
            id,
            slug,
            title,
            expectedUpdatedAt,
            beforeHash,
            replacements,
          }),
        ),
      },
      null,
      2,
    ),
  );

  if (!apply || changes.length === 0) return;

  const changedAt = new Date().toISOString();
  for (const change of changes) {
    const history = Array.isArray(change.metadata['seo_link_repair_history'])
      ? (change.metadata['seo_link_repair_history'] as unknown[])
      : [];
    const nextMetadata = {
      ...change.metadata,
      seo_link_repair_history: [
        ...history,
        {
          issue: 567,
          changed_at: changedAt,
          reason: 'search_console_legacy_internal_link_reconciliation',
          before_hash: change.beforeHash,
          replacements: change.replacements,
        },
      ].slice(-10),
    };
    const { data: updated, error: updateError } = await db
      .from('content_items')
      .update({
        draft_markdown: change.nextMarkdown,
        metadata: nextMetadata,
        updated_at: changedAt,
      })
      .eq('id', change.id)
      .eq('updated_at', change.expectedUpdatedAt)
      .select('id')
      .maybeSingle();
    if (updateError || !updated) {
      throw new Error(`${change.slug}: compare-and-set update failed`);
    }
  }

  const { error: logError } = await db.from('app_logs').insert({
    event: 'search_console_legacy_internal_links_reconciled',
    level: 'info',
    data: {
      issue: 567,
      changed_at: changedAt,
      changed_rows: changes.map((change) => ({
        id: change.id,
        slug: change.slug,
        before_hash: change.beforeHash,
        replacements: change.replacements,
      })),
    },
  });
  if (logError) throw logError;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
