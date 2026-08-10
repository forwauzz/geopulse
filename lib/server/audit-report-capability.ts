import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const VERSION = 'audit-full-v2';

type CapabilityPayload = {
  v: typeof VERSION;
  scanId: string;
  shareSlug: string | null;
  recipientHash: string;
  domain: string;
  campaignId: string;
  recipientFirstName: string;
  recipientCompany: string;
  issuedAt: number;
  expiresAt: number;
};

export type CapabilityFailure = 'malformed' | 'invalid_signature' | 'expired' | 'audience_mismatch';

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function recipientHash(email: string, domain: string): string {
  return createHash('sha256').update(`${normalize(email)}|${normalize(domain)}`).digest('hex');
}

function signature(encoded: string, secret: string): string {
  return createHmac('sha256', secret).update(encoded).digest('base64url');
}

export function issueAuditFullReportCapability(args: {
  secret: string;
  nowMs: number;
  expiresAtMs: number;
  scanId: string;
  shareSlug?: string | null;
  recipientEmail: string;
  domain: string;
  campaignId: string;
  recipientFirstName: string;
  recipientCompany: string;
}): string {
  if (args.secret.length < 24) throw new Error('AUDIT_REPORT_CAPABILITY_SECRET must contain at least 24 characters.');
  if (args.expiresAtMs <= args.nowMs) throw new Error('Capability expiry must be in the future.');
  const payload: CapabilityPayload = {
    v: VERSION,
    scanId: args.scanId,
    shareSlug: args.shareSlug?.trim() || null,
    recipientHash: recipientHash(args.recipientEmail, args.domain),
    domain: normalize(args.domain),
    campaignId: args.campaignId,
    recipientFirstName: args.recipientFirstName.trim().slice(0, 80),
    recipientCompany: args.recipientCompany.trim().slice(0, 160),
    issuedAt: args.nowMs,
    expiresAt: args.expiresAtMs,
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encoded}.${signature(encoded, args.secret)}`;
}

export function verifyAuditFullReportCapability(args: {
  token: string;
  secret: string;
  nowMs: number;
  recipientEmail?: string;
  domain?: string;
}): { ok: true; payload: CapabilityPayload } | { ok: false; code: CapabilityFailure } {
  const [encoded, supplied, extra] = args.token.split('.');
  if (!encoded || !supplied || extra) return { ok: false, code: 'malformed' };
  const expected = signature(encoded, args.secret);
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) {
    return { ok: false, code: 'invalid_signature' };
  }
  let payload: CapabilityPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as CapabilityPayload;
  } catch {
    return { ok: false, code: 'malformed' };
  }
  if (payload.v !== VERSION || !payload.scanId || !payload.domain || !payload.campaignId
    || !payload.recipientFirstName || !payload.recipientCompany) return { ok: false, code: 'malformed' };
  if (args.nowMs > payload.expiresAt) return { ok: false, code: 'expired' };
  if ((args.recipientEmail || args.domain) && (!args.recipientEmail || !args.domain
    || payload.domain !== normalize(args.domain)
    || payload.recipientHash !== recipientHash(args.recipientEmail, args.domain))) {
    return { ok: false, code: 'audience_mismatch' };
  }
  return { ok: true, payload };
}
