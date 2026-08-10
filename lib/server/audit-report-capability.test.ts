import { describe, expect, it } from 'vitest';
import { issueAuditFullReportCapability, verifyAuditFullReportCapability } from './audit-report-capability';

describe('audit full-report capability', () => {
  const secret = 'test-only-secret-with-enough-entropy';
  const nowMs = Date.parse('2026-08-09T12:00:00.000Z');

  it('accepts the intended recipient and domain, then fails closed for tampering, expiry, and wrong tenant', () => {
    const token = issueAuditFullReportCapability({
      secret,
      nowMs,
      expiresAtMs: nowMs + 7 * 86_400_000,
      scanId: '00000000-0000-4000-8000-000000000001',
      shareSlug: '1234567890abcdef1234567890abcdef',
      recipientEmail: 'owner@techehealthservices.com',
      domain: 'techehealthservices.com',
      campaignId: 'audit-direct-business-v1',
      recipientFirstName: 'Uzziel',
      recipientCompany: 'Teché Health Services',
    });

    expect(verifyAuditFullReportCapability({ token, secret, nowMs, recipientEmail: 'owner@techehealthservices.com', domain: 'techehealthservices.com' }).ok).toBe(true);
    expect(verifyAuditFullReportCapability({ token: `${token}x`, secret, nowMs, recipientEmail: 'owner@techehealthservices.com', domain: 'techehealthservices.com' })).toMatchObject({ ok: false, code: 'invalid_signature' });
    expect(verifyAuditFullReportCapability({ token, secret, nowMs: nowMs + 8 * 86_400_000, recipientEmail: 'owner@techehealthservices.com', domain: 'techehealthservices.com' })).toMatchObject({ ok: false, code: 'expired' });
    expect(verifyAuditFullReportCapability({ token, secret, nowMs, recipientEmail: 'other@agency.ca', domain: 'other.ca' })).toMatchObject({ ok: false, code: 'audience_mismatch' });
  });
});
