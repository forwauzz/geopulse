/**
 * POST /api/competitors/discover — step 3 of local competitor auto-discovery.
 *
 * Takes the (user-confirmed) business type + city and returns local competitors.
 *   - mock (default): deterministic, clearly-labelled SAMPLE competitors with sample scores so
 *     the whole detect→confirm→discover→compare UI ships and demos with zero Gemini cost.
 *   - gemini (COMPETITOR_DISCOVERY_MODE=live + billed key): real competitors via Google-Search
 *     grounding. Dormant until Gemini billing is enabled — the one remaining external blocker.
 */
import { z } from 'zod';
import { getClientIp, getScanApiEnv } from '@/lib/server/cf-env';
import { checkScanRateLimit } from '@/lib/server/rate-limit-kv';
import {
  mockCompetitors,
  resolveDiscoveryMode,
  type BusinessProfile,
} from '@/lib/server/competitor-discovery';
import { discoverCompetitorsLive } from '@/lib/server/competitor-discovery-gemini';
import { structuredLog } from '@/lib/server/structured-log';

export const runtime = 'nodejs';

const bodySchema = z.object({
  domain: z.string().min(1).max(255),
  businessType: z.string().max(120).default(''),
  city: z.string().max(120).nullish(),
  region: z.string().max(120).nullish(),
});

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

  const { domain, businessType, city, region } = parsed.data;
  const profile: BusinessProfile = {
    businessType,
    city: city ?? null,
    region: region ?? null,
    confidence: 'medium',
    source: 'heuristic',
  };

  const mode = resolveDiscoveryMode(env);

  if (mode === 'gemini') {
    const live = await discoverCompetitorsLive(env, profile, domain);
    if (live.ok) {
      structuredLog('competitor_discover', { domain, mode, count: live.competitors.length });
      return Response.json({ mode, competitors: live.competitors, note: null });
    }
    // Live failed (almost certainly billing/quota) — fall back to mock so the UI still works.
    structuredLog('competitor_discover_live_failed', { domain, reason: live.reason }, 'warning');
    return Response.json({
      mode: 'mock',
      competitors: mockCompetitors(profile, domain),
      note: `Live discovery unavailable (${live.reason}). Showing illustrative samples.`,
    });
  }

  structuredLog('competitor_discover', { domain, mode, count: 3 });
  return Response.json({
    mode,
    competitors: mockCompetitors(profile, domain),
    note: 'Illustrative samples. Live discovery of real local competitors needs Gemini billing enabled.',
  });
}
