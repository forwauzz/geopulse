import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('monthly intelligence blocked lifecycle template', () => {
  it('states that no movement or fix verification was claimed', () => {
    const sql = readFileSync(join(process.cwd(), 'supabase/migrations/093_monthly_intelligence_blocked_email.sql'), 'utf8');
    expect(sql).toContain("'monthly_intelligence_blocked'");
    expect(sql).toContain('preserved the last valid report');
    expect(sql).toContain('did not claim new movement or verified fixes');
    expect(sql).toContain('retry automatically');
  });
});
