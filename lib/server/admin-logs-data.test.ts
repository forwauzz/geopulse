import { describe, expect, it } from 'vitest';
import { createAdminLogsData } from './admin-logs-data';

describe('createAdminLogsData', () => {
  it('returns recent logs and applies level filter', async () => {
    const calls: Array<{ table: string; op: string; value?: unknown }> = [];

    const supabase = {
      from(table: string) {
        calls.push({ table, op: 'from' });
        return {
          select() {
            return this;
          },
          order() {
            return this;
          },
          limit() {
            return this;
          },
          eq(column: string, value: unknown) {
            calls.push({ table, op: column, value });
            return Promise.resolve({
              data: [
                {
                  id: 'log-1',
                  level: 'error',
                  event: 'weekly_report_failed',
                  data: { reason: 'missing_rows' },
                  created_at: '2026-03-27T17:00:00.000Z',
                },
              ],
              error: null,
            });
          },
          then: undefined,
        };
      },
    } as any;

    const result = await createAdminLogsData(supabase).getRecentLogs({ level: 'error' });
    expect(result).toEqual([
      {
        id: 'log-1',
        level: 'error',
        event: 'weekly_report_failed',
        data: { reason: 'missing_rows' },
        created_at: '2026-03-27T17:00:00.000Z',
      },
    ]);
    expect(calls.some((call) => call.op === 'level' && call.value === 'error')).toBe(true);
  });

  it('applies text search across event and payload', async () => {
    const supabase = {
      from(_table: string) {
        return {
          select() {
            return this;
          },
          order() {
            return this;
          },
          limit() {
            return Promise.resolve({
              data: [
                {
                  id: 'log-1',
                  level: 'warning',
                  event: 'deep_audit_checkout_stripe_redirect',
                  data: { scanId: 'scan-1', agencyAccountId: 'acct-1' },
                  created_at: '2026-04-01T10:00:00.000Z',
                },
                {
                  id: 'log-2',
                  level: 'info',
                  event: 'report_job_completed',
                  data: { scanId: 'scan-2' },
                  created_at: '2026-04-01T09:00:00.000Z',
                },
              ],
              error: null,
            });
          },
          eq() {
            return this;
          },
          then: undefined,
        };
      },
    } as any;

    const result = await createAdminLogsData(supabase).getRecentLogs({ query: 'acct-1', limit: 50 });
    expect(result).toHaveLength(1);
    expect(result[0]?.event).toBe('deep_audit_checkout_stripe_redirect');
  });
});
