import { describe, expect, it } from 'vitest';
import { hashBrevoOAuthState, signBrevoOAuthState, verifyBrevoOAuthState } from './brevo-oauth-state';

const SECRET = 'a-production-shaped-client-secret';
const PAYLOAD = {
  userId: '11111111-1111-4111-8111-111111111111',
  agencyAccountId: '22222222-2222-4222-8222-222222222222',
  issuedAt: 1_786_536_000_000,
  nonce: 'nonce',
};

describe('Brevo OAuth state', () => {
  it('round-trips a fresh tenant-bound state and hashes storage identity', async () => {
    const state = await signBrevoOAuthState(PAYLOAD, SECRET);
    await expect(verifyBrevoOAuthState(state, SECRET, PAYLOAD.issuedAt + 30_000)).resolves.toEqual(PAYLOAD);
    await expect(hashBrevoOAuthState(state)).resolves.toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('rejects tampering and expiry', async () => {
    const state = await signBrevoOAuthState(PAYLOAD, SECRET);
    await expect(verifyBrevoOAuthState(`${state}x`, SECRET, PAYLOAD.issuedAt + 1_000)).resolves.toBeNull();
    await expect(verifyBrevoOAuthState(state, SECRET, PAYLOAD.issuedAt + 11 * 60_000)).resolves.toBeNull();
  });
});
