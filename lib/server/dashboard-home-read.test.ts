import { describe, expect, it } from 'vitest';
import {
  DashboardHomeUnavailableError,
  readDashboardHomeData,
} from './dashboard-home-read';

describe('readDashboardHomeData', () => {
  it('returns data after a successful required dashboard read', async () => {
    const data = [{ id: 'scan-1' }];

    await expect(
      readDashboardHomeData('personal_scans', Promise.resolve({ data, error: null })),
    ).resolves.toBe(data);
  });

  it('preserves a successful empty read', async () => {
    await expect(
      readDashboardHomeData('startup_membership', Promise.resolve({ data: null, error: null })),
    ).resolves.toBeNull();
  });

  it('throws a typed unavailable error when Supabase returns an error', async () => {
    await expect(
      readDashboardHomeData(
        'monitoring_subscription',
        Promise.resolve({
          data: null,
          error: { code: 'PGRST000', message: 'provider detail' },
        }),
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'DashboardHomeUnavailableError',
        stage: 'monitoring_subscription',
      }),
    );
  });

  it('normalizes a thrown query failure without leaking provider detail', async () => {
    let thrown: unknown;
    try {
      await readDashboardHomeData(
        'personal_scans',
        Promise.reject(new Error('database hostname leaked')),
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DashboardHomeUnavailableError);
    expect(String(thrown)).not.toContain('database hostname leaked');
  });
});
