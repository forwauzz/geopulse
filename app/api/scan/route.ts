import { z } from 'zod';
import { GeminiProvider } from '@workers/providers/gemini';
import type { LLMProvider } from '@workers/lib/interfaces/providers';
import { runFreeScan } from '@workers/scan-engine/run-scan';
import { getClientIp, getScanApiEnv } from '@/lib/server/cf-env';
import { checkScanRateLimit } from '@/lib/server/rate-limit-kv';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { verifyTurnstileToken } from '@/lib/server/turnstile';

export const runtime = 'nodejs';

const bodySchema = z.object({
  url: z.string().url(),
  turnstileToken: z.string().min(1),
});

class UnconfiguredLlm implements LLMProvider {
  async analyze(): Promise<{ passed: boolean; reasoning: string; confidence: 'low' }> {
    return { passed: false, reasoning: 'GEMINI_API_KEY not configured', confidence: 'low' };
  }
}

export async function POST(request: Request): Promise<Response> {
  const env = await getScanApiEnv();
  const ip = getClientIp(request);

  const rl = await checkScanRateLimit(env.SCAN_CACHE, ip);
  if (!rl.ok) {
    return Response.json(
      { error: { code: 'rate_limited', message: 'Too many scans. Try again shortly.' } },
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

  const { url, turnstileToken } = parsed.data;

  const ts = await verifyTurnstileToken(env.TURNSTILE_SECRET_KEY, turnstileToken, ip);
  if (!ts.ok) {
    return Response.json(
      { error: { code: 'turnstile_failed', message: ts.error } },
      { status: 400 }
    );
  }

  if (!env.NEXT_PUBLIC_SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json(
      { error: { code: 'server_misconfigured', message: 'Supabase admin not configured' } },
      { status: 503 }
    );
  }

  const llm: LLMProvider = env.GEMINI_API_KEY
    ? new GeminiProvider({
        GEMINI_API_KEY: env.GEMINI_API_KEY,
        GEMINI_MODEL: env.GEMINI_MODEL,
        GEMINI_ENDPOINT: env.GEMINI_ENDPOINT,
      })
    : new UnconfiguredLlm();

  const scan = await runFreeScan(url, llm);
  if (!scan.ok) {
    return Response.json({ error: { code: 'scan_failed', message: scan.reason } }, { status: 400 });
  }

  const supabase = createServiceRoleClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { data: row, error } = await supabase
    .from('scans')
    .insert({
      url: scan.finalUrl,
      domain: scan.domain,
      status: 'complete',
      score: scan.output.score,
      letter_grade: scan.output.letterGrade,
      issues_json: scan.output.issues,
      full_results_json: scan.output.issues,
      user_id: null,
    })
    .select('id')
    .single();

  if (error || !row?.id) {
    return Response.json(
      { error: { code: 'db_error', message: error?.message ?? 'insert failed' } },
      { status: 500 }
    );
  }

  return Response.json({
    scanId: row.id,
    score: scan.output.score,
    letterGrade: scan.output.letterGrade,
    topIssues: scan.output.topIssues,
    finalUrl: scan.finalUrl,
    domain: scan.domain,
  });
}
