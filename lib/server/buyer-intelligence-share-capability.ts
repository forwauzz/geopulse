import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

const VERSION = 'buyer-intelligence-share-v1';
const payloadSchema = z.object({
  v: z.literal(VERSION),
  generationId: z.string().uuid(),
  agencyAccountId: z.string().uuid(),
  agencyClientId: z.string().uuid(),
  providerContactId: z.string().min(1).max(80),
  recipientHash: z.string().regex(/^[0-9a-f]{64}$/),
  recipientFirstName: z.string().min(1).max(80),
  recipientCompany: z.string().min(1).max(160),
  domain: z.string().min(3).max(253),
  issuedAt: z.number().int().nonnegative(),
  expiresAt: z.number().int().positive(),
}).strict();
export type BuyerIntelligenceSharePayload = z.infer<typeof payloadSchema>;

function normalized(value: string): string { return value.trim().toLowerCase(); }
function audienceHash(email: string, domain: string): string {
  return createHash('sha256').update(`${normalized(email)}|${normalized(domain)}`).digest('hex');
}
function signature(encoded: string, secret: string): string {
  return createHmac('sha256', secret).update(encoded).digest('base64url');
}

export function issueBuyerIntelligenceShareCapability(args: {
  secret: string; nowMs: number; expiresAtMs: number; generationId: string;
  agencyAccountId: string; agencyClientId: string; providerContactId: string;
  recipientEmail: string; recipientFirstName: string; recipientCompany: string; domain: string;
}): string {
  if (args.secret.length < 24) throw new Error('AUDIT_REPORT_CAPABILITY_SECRET must contain at least 24 characters.');
  if (args.expiresAtMs <= args.nowMs) throw new Error('Capability expiry must be in the future.');
  const payload = payloadSchema.parse({
    v: VERSION, generationId: args.generationId, agencyAccountId: args.agencyAccountId,
    agencyClientId: args.agencyClientId, providerContactId: args.providerContactId,
    recipientHash: audienceHash(args.recipientEmail, args.domain),
    recipientFirstName: args.recipientFirstName.trim(), recipientCompany: args.recipientCompany.trim(),
    domain: normalized(args.domain), issuedAt: args.nowMs, expiresAt: args.expiresAtMs,
  });
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encoded}.${signature(encoded, args.secret)}`;
}

export function verifyBuyerIntelligenceShareCapability(args: {
  token: string; secret: string; nowMs: number;
}): { ok: true; payload: BuyerIntelligenceSharePayload } | { ok: false; code: 'malformed' | 'invalid_signature' | 'expired' } {
  const [encoded, supplied, extra] = args.token.split('.');
  if (!encoded || !supplied || extra) return { ok: false, code: 'malformed' };
  const expected = signature(encoded, args.secret);
  const left = Buffer.from(supplied); const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return { ok: false, code: 'invalid_signature' };
  try {
    const payload = payloadSchema.parse(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')));
    if (args.nowMs > payload.expiresAt) return { ok: false, code: 'expired' };
    return { ok: true, payload };
  } catch { return { ok: false, code: 'malformed' }; }
}
