import { describe, expect, it } from 'vitest';
import {
  decryptDistributionToken,
  encryptDistributionToken,
  isEncryptedDistributionToken,
} from './distribution-token-crypto';

const KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

describe('distribution token crypto', () => {
  it('round-trips token material without storing plaintext', async () => {
    const encrypted = await encryptDistributionToken('x-refresh-token', KEY);
    expect(encrypted).not.toContain('x-refresh-token');
    expect(isEncryptedDistributionToken(encrypted)).toBe(true);
    await expect(decryptDistributionToken(encrypted, KEY)).resolves.toBe('x-refresh-token');
  });

  it('rejects an encrypted envelope when the key is unavailable', async () => {
    const encrypted = await encryptDistributionToken('x-access-token', KEY);
    await expect(decryptDistributionToken(encrypted)).rejects.toThrow(
      'DISTRIBUTION_TOKEN_ENCRYPTION_KEY is required'
    );
  });

  it('rejects tampered encrypted token material', async () => {
    const encrypted = await encryptDistributionToken('x-access-token', KEY);
    const [version, iv, ciphertext] = encrypted.split('.');
    const replacement = ciphertext!.startsWith('A') ? 'B' : 'A';
    const tampered = `${version}.${iv}.${replacement}${ciphertext!.slice(1)}`;
    await expect(decryptDistributionToken(tampered, KEY)).rejects.toThrow();
  });

  it('temporarily reads legacy plaintext rows for migration compatibility', async () => {
    await expect(decryptDistributionToken('legacy-token')).resolves.toBe('legacy-token');
    expect(isEncryptedDistributionToken('legacy-token')).toBe(false);
  });
});
