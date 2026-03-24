/**
 * API Key Authentication & Validation
 * GEO-Pulse — workers/lib/api-auth.ts
 *
 * Validates incoming API keys for the API-as-a-Service layer.
 * Keys are stored as sha256 hashes — plaintext never hits the DB.
 *
 * Key format: gp_{tier}_{32-byte-hex-random}
 * Examples:
 *   gp_free_a3f8c2e1d4b7a9f0c5e2d8b1a4f7c0e3
 *   gp_pro_b4c9d3e8f2a7b1c6d0e5f9a4b8c2d7e1
 *   gp_ent_c5d0e4f9a3b8c2d7e1f6a0b5c9d3e8f2
 *
 * SECURITY RULES:
 * - Never log API keys in plaintext
 * - Never return the full key after issuance
 * - Always hash before comparing or storing
 * - Keys are validated by hash lookup, not string comparison
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export type ApiTier = 'free' | 'pro' | 'enterprise';

export interface ValidatedApiKey {
  ok: true;
  apiKeyId: string;
  userId: string;
  tier: ApiTier;
  scansUsed: number;
  scansLimit: number;
  scansResetAt: string;
}

export interface ApiKeyValidationError {
  ok: false;
  statusCode: 401 | 402 | 429;
  code: string;
  message: string;
}

export type ApiKeyValidationResult = ValidatedApiKey | ApiKeyValidationError;

/**
 * Validate an API key from the Authorization header.
 * Looks up the hash in Supabase api_keys table (via service_role).
 *
 * @param request - Incoming request (reads Authorization header)
 * @param supabase - Supabase client initialized with service_role key
 */
export async function validateApiKey(
  request: Request,
  supabase: SupabaseClient
): Promise<ApiKeyValidationResult> {
  // 1. Extract key from Authorization: Bearer {key}
  const authHeader = request.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      ok: false,
      statusCode: 401,
      code: 'unauthorized',
      message: 'Missing or invalid Authorization header. Expected: Authorization: Bearer {api_key}',
    };
  }

  const rawKey = authHeader.slice(7).trim();

  // 2. Validate key format: gp_{tier}_{hex}
  if (!isValidKeyFormat(rawKey)) {
    return {
      ok: false,
      statusCode: 401,
      code: 'invalid_api_key',
      message: 'API key format is invalid',
    };
  }

  // 3. Hash the key — never send plaintext to the DB
  const keyHash = await hashApiKey(rawKey);

  // 4. Look up by hash in Supabase
  const { data: apiKey, error } = await supabase
    .from('api_keys')
    .select('id, user_id, tier, scans_used, scans_limit, scans_reset_at, active')
    .eq('key_hash', keyHash)
    .single();

  if (error || !apiKey) {
    return {
      ok: false,
      statusCode: 401,
      code: 'invalid_api_key',
      message: 'API key not found or invalid',
    };
  }

  // 5. Check key is active
  if (!apiKey.active) {
    return {
      ok: false,
      statusCode: 401,
      code: 'api_key_revoked',
      message: 'This API key has been revoked',
    };
  }

  // 6. Check quota
  if (apiKey.scans_used >= apiKey.scans_limit) {
    return {
      ok: false,
      statusCode: 402,
      code: 'scan_limit_exceeded',
      message: `Monthly scan quota exhausted (${apiKey.scans_used}/${apiKey.scans_limit}). Resets ${apiKey.scans_reset_at}`,
    };
  }

  // 7. Update last_used_at (fire and forget — don't block validation)
  void supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', apiKey.id);

  return {
    ok: true,
    apiKeyId: apiKey.id as string,
    userId: apiKey.user_id as string,
    tier: apiKey.tier as ApiTier,
    scansUsed: apiKey.scans_used as number,
    scansLimit: apiKey.scans_limit as number,
    scansResetAt: apiKey.scans_reset_at as string,
  };
}

/**
 * Issue a new API key for a user.
 * Returns the FULL key ONCE — it cannot be retrieved again.
 * Only the prefix and hash are stored.
 */
export async function issueApiKey(
  userId: string,
  tier: ApiTier,
  name: string,
  supabase: SupabaseClient
): Promise<{ fullKey: string; prefix: string; id: string }> {
  // Generate cryptographically secure random bytes
  const randomBytes = new Uint8Array(32);
  crypto.getRandomValues(randomBytes);
  const randomHex = Array.from(randomBytes).map(b => b.toString(16).padStart(2, '0')).join('');

  const fullKey = `gp_${tier}_${randomHex}`;
  const keyPrefix = fullKey.slice(0, 14); // e.g. "gp_pro_a3f8c2"
  const keyHash = await hashApiKey(fullKey);
  const scansLimit = tierToScanLimit(tier);

  const { data, error } = await supabase
    .from('api_keys')
    .insert({
      user_id: userId,
      key_prefix: keyPrefix,
      key_hash: keyHash,
      tier,
      name,
      scans_limit: scansLimit,
    })
    .select('id')
    .single();

  if (error || !data) {
    throw new Error('Failed to store API key');
  }

  // Return the full key — this is the ONLY time it will ever be shown
  return {
    fullKey,  // show this to the user ONCE
    prefix: keyPrefix,
    id: data.id as string,
  };
}

/**
 * Check if an API key tier has access to a required minimum tier.
 */
export function hasTierAccess(keyTier: ApiTier, requiredTier: ApiTier): boolean {
  const tierOrder: ApiTier[] = ['free', 'pro', 'enterprise'];
  return tierOrder.indexOf(keyTier) >= tierOrder.indexOf(requiredTier);
}

/**
 * Build rate limit response headers for an API response.
 */
export function buildRateLimitHeaders(
  validated: ValidatedApiKey,
  rateLimit: { limit: number; remaining: number; resetTimestamp: number }
): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(rateLimit.limit),
    'X-RateLimit-Remaining': String(Math.max(0, rateLimit.remaining)),
    'X-RateLimit-Reset': String(rateLimit.resetTimestamp),
    'X-GeoP-Scans-Used': String(validated.scansUsed),
    'X-GeoP-Scans-Limit': String(validated.scansLimit),
    'X-GeoP-Scans-Reset': validated.scansResetAt,
  };
}

// ============================================================
// Private helpers
// ============================================================

/**
 * Hash an API key using SHA-256.
 * Used for both storage and lookup — the hash IS the key identity.
 */
async function hashApiKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Validate the format of an API key before hashing.
 * Format: gp_{tier}_{64-hex-chars}
 */
function isValidKeyFormat(key: string): boolean {
  return /^gp_(free|pro|ent)_[0-9a-f]{64}$/.test(key);
}

/**
 * Map API tier to monthly scan limit.
 */
function tierToScanLimit(tier: ApiTier): number {
  const limits: Record<ApiTier, number> = {
    free: 100,
    pro: 2000,
    enterprise: 999999,
  };
  return limits[tier];
}
