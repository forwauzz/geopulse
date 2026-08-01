import { describe, expect, it } from 'vitest';
import {
  getReportOverride,
  resolveForClient,
  saveReportOverride,
  type ReportScope,
} from './report-settings-store';

/** Minimal in-memory stand-in for the two Supabase calls the store makes. */
function makeSupabase(rows: Record<string, { metadata: unknown }>, opts?: { failRead?: boolean }) {
  const writes: { table: string; id: string; metadata: unknown }[] = [];
  const supabase = {
    from(table: string) {
      return {
        select() {
          return {
            eq(_column: string, id: string) {
              return {
                async maybeSingle() {
                  if (opts?.failRead) return { data: null, error: new Error('boom') };
                  return { data: rows[`${table}:${id}`] ?? null, error: null };
                },
              };
            },
          };
        },
        update(values: Record<string, unknown>) {
          return {
            async eq(_column: string, id: string) {
              rows[`${table}:${id}`] = { metadata: values['metadata'] };
              writes.push({ table, id, metadata: values['metadata'] });
              return { error: null };
            },
          };
        },
      };
    },
  };
  return { supabase, writes, rows };
}

const AGENCY: ReportScope = { table: 'agency_accounts', id: 'agency-1' };
const CLIENT: ReportScope = { table: 'agency_clients', id: 'client-1' };

describe('getReportOverride', () => {
  it('returns an empty override when the scope has stored nothing', async () => {
    const { supabase } = makeSupabase({});
    expect(await getReportOverride({ supabase, scope: AGENCY })).toEqual({});
  });

  it('does not invent defaults — an unset scope is empty, not populated', async () => {
    const { supabase } = makeSupabase({ 'agency_accounts:agency-1': { metadata: { brand: {} } } });
    expect(await getReportOverride({ supabase, scope: AGENCY })).toEqual({});
  });

  it('reads back only what was stored', async () => {
    const { supabase } = makeSupabase({
      'agency_accounts:agency-1': { metadata: { report: { sections: { opportunities: false } } } },
    });
    expect(await getReportOverride({ supabase, scope: AGENCY })).toEqual({
      sections: { opportunities: false },
    });
  });

  it('degrades to empty on a malformed stored value instead of throwing', async () => {
    const { supabase } = makeSupabase({
      'agency_accounts:agency-1': { metadata: { report: 'garbage' } },
    });
    expect(await getReportOverride({ supabase, scope: AGENCY })).toEqual({});
  });

  it('rejects a scope table that is not one of the three owning tables', async () => {
    const { supabase } = makeSupabase({});
    await expect(
      getReportOverride({ supabase, scope: { table: 'scans' as never, id: 'x' } })
    ).rejects.toThrow('report_settings_scope_invalid');
  });

  it('surfaces a read failure rather than silently returning defaults', async () => {
    const { supabase } = makeSupabase({}, { failRead: true });
    await expect(getReportOverride({ supabase, scope: AGENCY })).rejects.toThrow(
      'report_settings_read_failed'
    );
  });
});

describe('saveReportOverride', () => {
  it('stores only the keys the caller set', async () => {
    const { supabase, writes } = makeSupabase({});
    await saveReportOverride({
      supabase,
      scope: AGENCY,
      override: { sections: { opportunities: false } },
    });
    expect(writes[0]!.metadata).toEqual({ report: { sections: { opportunities: false } } });
  });

  it('preserves sibling metadata such as brand', async () => {
    const { supabase, writes } = makeSupabase({
      'agency_accounts:agency-1': { metadata: { brand: { companyName: 'Lifter' } } },
    });
    await saveReportOverride({ supabase, scope: AGENCY, override: { layout: 'per_engine' } });
    expect(writes[0]!.metadata).toEqual({
      brand: { companyName: 'Lifter' },
      report: { layout: 'per_engine' },
    });
  });

  it('throws when the write is silently dropped, rather than reporting success', async () => {
    // Reproduces the real failure: row-level security filters the UPDATE, PostgREST returns no
    // error, and zero rows change. Without the read-back the UI reported "Saved" and nothing was.
    const rows: Record<string, { metadata: unknown }> = {};
    const supabase = {
      from(table: string) {
        return {
          select() {
            return {
              eq(_c: string, id: string) {
                return { async maybeSingle() { return { data: rows[`${table}:${id}`] ?? null, error: null }; } };
              },
            };
          },
          update() {
            // Accepts the write, changes nothing, reports no error.
            return { async eq() { return { error: null }; } };
          },
        };
      },
    };
    await expect(
      saveReportOverride({ supabase, scope: AGENCY, override: { layout: 'per_engine' } })
    ).rejects.toThrow('report_settings_write_not_applied');
  });

  it('removes the key entirely when the override is empty, rather than writing {}', async () => {
    // This is what "reset to the default" writes. An empty object would read back as an override.
    const { supabase, writes } = makeSupabase({
      'agency_clients:client-1': {
        metadata: { brand: { primary: '#3c88af' }, report: { sections: { promptPerformance: false } } },
      },
    });
    await saveReportOverride({ supabase, scope: CLIENT, override: {} });
    expect(writes[0]!.metadata).toEqual({ brand: { primary: '#3c88af' } });
    expect(Object.keys(writes[0]!.metadata as object)).not.toContain('report');
  });
});

describe('resolveForClient', () => {
  it('returns the client effective state and what it would inherit without its own override', async () => {
    const { supabase } = makeSupabase({
      'agency_accounts:agency-1': {
        metadata: { report: { sections: { opportunities: false, promptPerformance: true } } },
      },
      'agency_clients:client-1': { metadata: { report: { sections: { promptPerformance: false } } } },
    });

    const result = await resolveForClient({ supabase, agency: AGENCY, client: CLIENT });

    expect(result.effective.sections.promptPerformance).toBe(false);
    // Not overridden by the client, so it still follows the agency's false.
    expect(result.effective.sections.opportunities).toBe(false);
    // Without the client override this row would follow the agency.
    expect(result.inherited.sections.promptPerformance).toBe(true);
    expect(result.clientOverride).toEqual({ sections: { promptPerformance: false } });
  });

  it('leaves a client following the agency entirely when it has stored nothing', async () => {
    const { supabase } = makeSupabase({
      'agency_accounts:agency-1': { metadata: { report: { layout: 'per_engine' } } },
    });
    const result = await resolveForClient({ supabase, agency: AGENCY, client: CLIENT });
    expect(result.clientOverride).toEqual({});
    expect(result.effective).toEqual(result.inherited);
    expect(result.effective.layout).toBe('per_engine');
  });
});
