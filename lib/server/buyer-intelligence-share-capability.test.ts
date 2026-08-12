import { describe, expect, it } from 'vitest';
import { issueBuyerIntelligenceShareCapability, verifyBuyerIntelligenceShareCapability } from './buyer-intelligence-share-capability';

const SECRET = '0123456789abcdef0123456789abcdef';
const input = {
  secret: SECRET, nowMs: 1_700_000_000_000, expiresAtMs: 1_700_086_400_000,
  generationId: '11111111-1111-4111-8111-111111111111',
  agencyAccountId: '22222222-2222-4222-8222-222222222222',
  agencyClientId: '33333333-3333-4333-8333-333333333333', providerContactId: '1592',
  recipientEmail: 'founder@alie.example', recipientFirstName: 'Founder', recipientCompany: 'Alie', domain: 'alie.example',
};

describe('buyer intelligence share capability', () => {
  it('binds a signed expiring link to one generation, tenant, and CRM contact', () => {
    const token = issueBuyerIntelligenceShareCapability(input);
    const verified = verifyBuyerIntelligenceShareCapability({ token, secret: SECRET, nowMs: input.nowMs + 1 });
    expect(verified).toMatchObject({ ok: true, payload: {
      generationId: input.generationId, agencyAccountId: input.agencyAccountId,
      providerContactId: '1592', domain: 'alie.example', recipientFirstName: 'Founder',
    } });
  });

  it('rejects tampering and expiry', () => {
    const token = issueBuyerIntelligenceShareCapability(input);
    expect(verifyBuyerIntelligenceShareCapability({ token: `${token}x`, secret: SECRET, nowMs: input.nowMs })).toEqual({ ok: false, code: 'invalid_signature' });
    expect(verifyBuyerIntelligenceShareCapability({ token, secret: SECRET, nowMs: input.expiresAtMs + 1 })).toEqual({ ok: false, code: 'expired' });
  });
});
