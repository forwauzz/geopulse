import { getCloudflareContext } from '@opennextjs/cloudflare';
import { getScanForPublicShare } from '@/lib/server/get-scan-for-public-share';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export const runtime = 'nodejs';

async function fetchReportMarkdown(markdownUrl: string): Promise<Response> {
  return fetch(markdownUrl, { cache: 'no-store' });
}

async function resolveReportFilesBucket(): Promise<R2Bucket | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    const bucket = (env as unknown as Record<string, unknown>)['REPORT_FILES'];
    if (bucket && typeof (bucket as R2Bucket).get === 'function') {
      return bucket as R2Bucket;
    }
  } catch {
    // Fall through to sync context.
  }

  try {
    const { env } = getCloudflareContext({ async: false });
    const bucket = (env as unknown as Record<string, unknown>)['REPORT_FILES'];
    if (bucket && typeof (bucket as R2Bucket).get === 'function') {
      return bucket as R2Bucket;
    }
  } catch {
    // Binding unavailable in this runtime.
  }

  return undefined;
}

async function readMarkdownFromBucket(scanId: string): Promise<string | null> {
  const bucket = await resolveReportFilesBucket();
  if (!bucket) return null;
  const object = await bucket.get(`deep-audits/${scanId}/report.md`);
  if (!object) return null;
  return object.text();
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { id } = await context.params;
  const download = new URL(request.url).searchParams.get('download') === '1';

  try {
    const sessionClient = await createSupabaseServerClient();
    const {
      data: { user },
    } = await sessionClient.auth.getUser();

    if (user?.id) {
      const env = await getScanApiEnv();
      if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
        return Response.json({ error: { code: 'server_misconfigured' } }, { status: 503 });
      }

      const adminDb = createServiceRoleClient(
        env.NEXT_PUBLIC_SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );

      const { data: scan, error: scanErr } = await adminDb
        .from('scans')
        .select('id,user_id')
        .eq('id', id)
        .maybeSingle();

      if (scanErr) {
        return Response.json(
          { error: { code: 'db_error', message: scanErr.message } },
          { status: 500 }
        );
      }
      if (!scan) {
        return Response.json({ error: { code: 'not_found' } }, { status: 404 });
      }
      if (scan.user_id !== null && scan.user_id !== user.id) {
        return Response.json({ error: { code: 'forbidden' } }, { status: 403 });
      }

      const { data: report, error: reportErr } = await adminDb
        .from('reports')
        .select('markdown_url')
        .eq('scan_id', id)
        .eq('type', 'deep_audit')
        .limit(1)
        .maybeSingle();

      if (reportErr) {
        return Response.json(
          { error: { code: 'db_error', message: reportErr.message } },
          { status: 500 }
        );
      }
      if (!report?.markdown_url) {
        const bucketMarkdown = await readMarkdownFromBucket(id);
        if (!bucketMarkdown) {
          return Response.json({ error: { code: 'no_markdown' } }, { status: 404 });
        }

        return new Response(bucketMarkdown, {
          status: 200,
          headers: {
            'content-type': 'text/markdown; charset=utf-8',
            'cache-control': 'private, no-store',
            ...(download
              ? {
                  'content-disposition': `attachment; filename="geo-pulse-deep-audit-${id}.md"`,
                }
              : {}),
          },
        });
      }

      const bucketMarkdown = await readMarkdownFromBucket(id);
      if (bucketMarkdown) {
        return new Response(bucketMarkdown, {
          status: 200,
          headers: {
            'content-type': 'text/markdown; charset=utf-8',
            'cache-control': 'private, no-store',
            ...(download
              ? {
                  'content-disposition': `attachment; filename="geo-pulse-deep-audit-${id}.md"`,
                }
              : {}),
          },
        });
      }

      const upstream = await fetchReportMarkdown(report.markdown_url);
      if (!upstream.ok) {
        return Response.json({ error: { code: 'markdown_fetch_failed' } }, { status: 502 });
      }

      const markdown = await upstream.text();
      return new Response(markdown, {
        status: 200,
        headers: {
          'content-type': 'text/markdown; charset=utf-8',
          'cache-control': 'private, no-store',
          ...(download
            ? {
                'content-disposition': `attachment; filename="geo-pulse-deep-audit-${id}.md"`,
              }
            : {}),
        },
      });
    }
  } catch {
    // Fall through to guest/public-share validation.
  }

  const env = await getScanApiEnv();
  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: { code: 'server_misconfigured' } }, { status: 503 });
  }

  const result = await getScanForPublicShare(
    id,
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  if (!result.ok) {
    if (result.code === 'invalid_id') {
      return Response.json({ error: { code: 'invalid_id' } }, { status: 400 });
    }
    if (result.code === 'not_found') {
      return Response.json({ error: { code: 'not_found' } }, { status: 404 });
    }
    if (result.code === 'forbidden') {
      return Response.json({ error: { code: 'forbidden' } }, { status: 403 });
    }
    if (result.code === 'expired') {
      return Response.json({ error: { code: 'expired' } }, { status: 410 });
    }
    return Response.json({ error: { code: 'db_error', message: result.message } }, { status: 500 });
  }

  if (!result.data.markdownUrl) {
    const bucketMarkdown = await readMarkdownFromBucket(id);
    if (!bucketMarkdown) {
      return Response.json({ error: { code: 'no_markdown' } }, { status: 404 });
    }

    return new Response(bucketMarkdown, {
      status: 200,
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'cache-control': 'private, no-store',
        ...(download
          ? {
              'content-disposition': `attachment; filename="geo-pulse-deep-audit-${id}.md"`,
            }
          : {}),
      },
    });
  }

  const bucketMarkdown = await readMarkdownFromBucket(id);
  if (bucketMarkdown) {
    return new Response(bucketMarkdown, {
      status: 200,
      headers: {
        'content-type': 'text/markdown; charset=utf-8',
        'cache-control': 'private, no-store',
        ...(download
          ? {
              'content-disposition': `attachment; filename="geo-pulse-deep-audit-${id}.md"`,
            }
          : {}),
      },
    });
  }

  const upstream = await fetchReportMarkdown(result.data.markdownUrl);
  if (!upstream.ok) {
    return Response.json({ error: { code: 'markdown_fetch_failed' } }, { status: 502 });
  }

  const markdown = await upstream.text();
  return new Response(markdown, {
    status: 200,
    headers: {
      'content-type': 'text/markdown; charset=utf-8',
      'cache-control': 'private, no-store',
      ...(download
        ? {
            'content-disposition': `attachment; filename="geo-pulse-deep-audit-${id}.md"`,
          }
        : {}),
    },
  });
}
