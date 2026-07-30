import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/078_vertical_campaign_intelligence.sql'),
  'utf8',
);

describe('vertical campaign intelligence schema', () => {
  it('creates one canonical campaign and intervention ledger', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.growth_campaigns');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.growth_campaign_interventions');
    expect(migration).toContain('growth_campaigns_one_active_role_idx');
    expect(migration).toContain("'primary',");
    expect(migration).toContain("'challenger',");
  });

  it('carries lineage across execution and attribution ledgers', () => {
    for (const table of [
      'public.seo_opportunities',
      'public.content_items',
      'public.outreach_prospects',
      'public.distribution_assets',
      'analytics.marketing_events',
    ]) {
      expect(migration).toContain(`ALTER TABLE ${table}`);
    }
    expect(migration).toContain('growth_campaign_id UUID');
    expect(migration).toContain('growth_intervention_id UUID');
  });

  it('seeds an 80/20 MSP primary and agency challenger without widening scope', () => {
    expect(migration).toContain("'msp-qc-first-customer-2026q3'");
    expect(migration).toContain("'agency-challenger-2026q3'");
    expect(migration).toContain("'msp_it_services'");
    expect(migration).toContain("'marketing_agencies'");
    expect(migration).toContain('    80,');
    expect(migration).toContain('    20,');
  });

  it('keeps broad SEO evidence out of execution unless it has an explicit vertical match', () => {
    expect(migration).toContain('Only explicit vertical evidence is campaign-eligible');
    expect(migration).toContain('growth_campaign_id IS NULL');
    expect(migration).toContain('campaign_gate');
  });

  it('retains service-role-only access and continuous intelligence capture', () => {
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('TO service_role');
    expect(migration).toContain('intelligence_capture_growth_campaigns');
    expect(migration).toContain('intelligence_capture_growth_campaign_interventions');
  });
});
