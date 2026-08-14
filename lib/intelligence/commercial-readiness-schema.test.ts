import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '094_scope_commercial_readiness_to_active_protocol.sql'),
  'utf8',
);

describe('commercial readiness active protocol view', () => {
  it('selects one latest scheduled protocol per vertical', () => {
    expect(migration).toContain('active_protocol AS');
    expect(migration).toContain('DISTINCT ON (canonical_vertical)');
    expect(migration).toContain("group_row.metadata ->> 'schedule_version' = active.schedule_version");
    expect(migration).toContain("coalesce(group_row.metadata ->> 'trigger_source', 'worker_cron') = 'worker_cron'");
  });

  it('scopes completed domains and eligible windows to that exact protocol', () => {
    expect(migration).toContain('group_row.query_set_id = active.query_set_id');
    expect(migration).toContain('group_row.model_set_version = active.model_set_version');
    expect(migration).toContain('raw_window.schedule_version = active.schedule_version');
    expect(migration).toContain('Historical evidence remains preserved outside this view'.toLowerCase());
  });
});
