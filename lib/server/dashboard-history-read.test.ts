import { describe, expect, it } from 'vitest';
import {
  DashboardHistoryUnavailableError,
  readDashboardHistoryData,
} from './dashboard-history-read';

describe('readDashboardHistoryData', () => {
  it('returns data after a successful required history read', async () => {
    const data = [{ id: 'scan-1' }];

    await expect(
      readDashboardHistoryData('personal_scans', Promise.resolve({ data, error: null })),
    ).resolves.toBe(data);
  });

  it('preserves a successful empty read', async () => {
    await expect(
      readDashboardHistoryData('personal_reports', Promise.resolve({ data: [], error: null })),
    ).resolves.toEqual([]);
  });

  it('throws a typed unavailable error when Supabase returns an error', async () => {
    await expect(
      readDashboardHistoryData(
        'personal_subscriptions',
        Promise.resolve({
          data: null,
          error: { code: 'PGRST000', message: 'provider detail' },
        }),
      ),
    ).rejects.toEqual(
      expect.objectContaining({
        name: 'DashboardHistoryUnavailableError',
        stage: 'personal_subscriptions',
      }),
    );
  });

  it('normalizes a thrown query failure without leaking provider detail', async () => {
    let thrown: unknown;
    try {
      await readDashboardHistoryData(
        'personal_scans',
        Promise.reject(new Error('database hostname leaked')),
      );
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(DashboardHistoryUnavailableError);
    expect(String(thrown)).not.toContain('database hostname leaked');
  });
});
