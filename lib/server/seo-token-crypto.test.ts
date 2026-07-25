import { describe, expect, it } from 'vitest';
import {
  decryptSeoToken,
  encryptSeoToken,
  signSeoOAuthState,
  verifySeoOAuthState,
} from './seo-token-crypto';

const KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

describe('SEO token crypto', () => {
  it('round-trips token material without storing plaintext', async () => {
    const encrypted = await encryptSeoToken('refresh-token', KEY);
    expect(encrypted).not.toContain('refresh-token');
    await expect(decryptSeoToken(encrypted, KEY)).resolves.toBe('refresh-token');
  });

  it('rejects tampered OAuth state and accepts a fresh signed state', async () => {
    const payload = {
      userId: 'user-1',
      returnTo: '/admin/automation',
      issuedAt: 1_000,
      nonce: 'nonce-1',
    };
    const state = await signSeoOAuthState(payload, 'client-secret');
    await expect(verifySeoOAuthState(state, 'client-secret', 1_500)).resolves.toEqual(payload);
    const [body, signature] = state.split('.');
    await expect(
      verifySeoOAuthState(`${body}.${signature!.startsWith('A') ? 'B' : 'A'}${signature!.slice(1)}`, 'client-secret', 1_500)
    ).resolves.toBeNull();
  });

  it('rejects expired state', async () => {
    const state = await signSeoOAuthState(
      { userId: 'user-1', returnTo: '/', issuedAt: 1_000, nonce: 'nonce-1' },
      'client-secret'
    );
    await expect(verifySeoOAuthState(state, 'client-secret', 1_000_000, 10_000)).resolves.toBeNull();
  });
});
