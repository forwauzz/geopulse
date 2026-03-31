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
});
