import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/server/require-admin', () => ({
  isUserPlatformAdmin: vi.fn(),
}));

import { isDistributionOAuthAdmin } from './distribution-oauth-admin-gate';
import { isUserPlatformAdmin } from './require-admin';

const mockedIsUserPlatformAdmin = vi.mocked(isUserPlatformAdmin);

describe('isDistributionOAuthAdmin', () => {
  it('returns true when DB platform admin is true', async () => {
    mockedIsUserPlatformAdmin.mockResolvedValueOnce(true);
    await expect(
      isDistributionOAuthAdmin('u1', 'other@example.com', 'https://x.supabase.co', 'srk'),
    ).resolves.toBe(true);
    expect(mockedIsUserPlatformAdmin).toHaveBeenCalledWith(
      'u1',
      undefined,
      'https://x.supabase.co',
      'srk',
    );
  });

  it('returns false when DB admin is false', async () => {
    mockedIsUserPlatformAdmin.mockResolvedValueOnce(false);
    await expect(
      isDistributionOAuthAdmin('u1', 'nope@example.com', 'https://x.supabase.co', 'srk'),
    ).resolves.toBe(false);
  });

  it('skips DB check when URL or key missing', async () => {
    mockedIsUserPlatformAdmin.mockClear();
    await expect(isDistributionOAuthAdmin('u1', 'legacy@example.com', undefined, undefined)).resolves.toBe(false);
    expect(mockedIsUserPlatformAdmin).not.toHaveBeenCalled();
  });
});
