export type IntelligenceRateLimitResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly retryAfterSec: number };

const WINDOW_SECONDS = 60;
const REQUESTS_PER_WINDOW = 30;

export async function checkIntelligenceRateLimit(
  kv: KVNamespace | undefined,
  actorId: string,
  now = Date.now()
): Promise<IntelligenceRateLimitResult> {
  if (!kv) return { ok: true };
  const bucket = Math.floor(now / (WINDOW_SECONDS * 1000));
  const key = `rl:intelligence:actor:${actorId}:${bucket}`;
  const current = Number.parseInt((await kv.get(key)) ?? '0', 10);
  if (Number.isFinite(current) && current >= REQUESTS_PER_WINDOW) {
    return { ok: false, retryAfterSec: WINDOW_SECONDS };
  }
  await kv.put(key, String((Number.isFinite(current) ? current : 0) + 1), {
    expirationTtl: WINDOW_SECONDS * 2,
  });
  return { ok: true };
}
