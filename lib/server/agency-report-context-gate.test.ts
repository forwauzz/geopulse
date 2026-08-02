import { describe, expect, it } from 'vitest';
import { appendAgencyReportCandidateQuarantine } from './agency-report-context-gate';

describe('agency report candidate quarantine', () => {
  it('records actionable append-only reasons without creating or rewriting an artifact', async () => {
    const inserts: unknown[] = [];
    const existingReasons = new Set<string>();
    const supabase = {
      from(table: string) {
        expect(table).toBe('intelligence_quarantine_events');
        const chain: any = {
          select() { return chain; },
          eq() { return chain; },
          in() { return Promise.resolve({ data: [...existingReasons].map((reason_code) => ({ reason_code })), error: null }); },
          async insert(rows: unknown) {
            inserts.push(rows);
            for (const row of rows as Array<{ reason_code: string }>) existingReasons.add(row.reason_code);
            return { error: null };
          },
        };
        return chain;
      },
    };
    await appendAgencyReportCandidateQuarantine({
      supabase: supabase as never,
      configId: 'config-sanomed',
      windowDate: '2026-08',
      platformRuns: [{ platform: 'gemini', runGroupId: 'run-uk' }],
      reasons: ['market_mismatch', 'query_set_version_mismatch'],
    });

    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toEqual([
      expect.objectContaining({
        source_kind: 'agency_report_candidate', action: 'quarantine', reason_code: 'market_mismatch',
        actor_id: 'agency_report_integrity_v1',
        evidence_refs: [expect.objectContaining({
          config_id: 'config-sanomed', window_date: '2026-08',
          next_action: expect.stringContaining('generate a new immutable artifact'),
        })],
      }),
      expect.objectContaining({ reason_code: 'query_set_version_mismatch' }),
    ]);
    await appendAgencyReportCandidateQuarantine({
      supabase: supabase as never,
      configId: 'config-sanomed',
      windowDate: '2026-08',
      platformRuns: [{ platform: 'gemini', runGroupId: 'run-uk' }],
      reasons: ['market_mismatch', 'query_set_version_mismatch'],
    });
    expect(inserts).toHaveLength(1);
  });
});
