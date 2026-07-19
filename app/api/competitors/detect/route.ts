/**
 * POST /api/competitors/detect — step 1 of local competitor auto-discovery.
 *
 * Re-fetches the scanned page (SSRF-gated) and runs deterministic heuristic detection of the
 * business type + city. No LLM, no Gemini cost — this step works today. The `mode` field tells
 * the client whether the follow-up discover step will run live (Gemini google_search) or mock.
 */
import { z } from 'zod';
import { fetchPage } from '@workers/scan-engine/fetch-page';
import { parsePageSignals, buildTextSample } from '@workers/scan-engine/parse-signals';
import { getClientIp, getScanApiEnv } from '@/lib/server/cf-env';
import { checkScanRateLimit } from '@/lib/server/rate-limit-kv';
import { detectBusinessProfile, resolveDiscoveryMode } from '@/lib/server/competitor-discovery';
import { structuredLog } from '@/lib/server/structured-log';

export const runtime = 'nodejs';

const bodySchema = z.object({ url: z.string().url() });

export async function POST(request: Request): Promise<Response> {
  const env = await getScanApiEnv();
  const ip = getClientIp(request);

  const rl = await checkScanRateLimit(env.SCAN_CACHE, ip);
  if (!rl.ok) {
    return Response.json(
      { error: { code: 'rate_limited', message: 'Too many requests. Try again shortly.' } },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSec ?? 60) } }
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return Response.json({ error: { code: 'bad_json', message: 'Invalid JSON' } }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return Response.json(
      { error: { code: 'validation_error', message: parsed.error.flatten() } },
      { status: 400 }
    );
  }

  const fetched = await fetchPage(parsed.data.url);
  if (!fetched.ok) {
    return Response.json(
      { error: { code: 'fetch_failed', message: fetched.reason } },
      { status: 400 }
    );
  }

  const signals = parsePageSignals(fetched.html);
  const profile = detectBusinessProfile({
    title: signals.title,
    metaDescription: signals.metaDescription,
    textSample: buildTextSample(fetched.html),
    jsonLdTypes: signals.jsonLdTypes,
    html: fetched.html,
  });
  const mode = resolveDiscoveryMode(env);

  structuredLog('competitor_detect', {
    url: fetched.finalUrl,
    businessType: profile.businessType,
    city: profile.city,
    confidence: profile.confidence,
    source: profile.source,
    mode,
  });

  return Response.json({ profile, mode });
}
