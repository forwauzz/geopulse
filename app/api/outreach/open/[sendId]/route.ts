import { getScanApiEnv } from '@/lib/server/cf-env';
import { markOutreachOpen } from '@/lib/server/outreach';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export const runtime = 'nodejs';

/** 1x1 transparent GIF. */
const PIXEL = Uint8Array.from(
  atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'),
  (c) => c.charCodeAt(0)
);

/**
 * First-party open pixel for outreach emails. Always returns the pixel — recording the open is
 * best-effort and must never block or error the image request.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ sendId: string }> }
): Promise<Response> {
  const { sendId } = await params;

  if (sendId && sendId.length <= 64) {
    try {
      const env = await getScanApiEnv();
      if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
        const supabase = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
        await markOutreachOpen(supabase, sendId.replace(/\.gif$/i, ''));
      }
    } catch {
      /* pixel must always render */
    }
  }

  return new Response(PIXEL, {
    headers: {
      'Content-Type': 'image/gif',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
