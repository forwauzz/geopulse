import { describe, it, expect } from 'vitest';
import { createGpmAdminData } from './geo-performance-admin-data';
import { validateClientBenchmarkConfigInput, mergeGpmBundleCaps } from './geo-performance-entitlements';

// ── Supabase mock builder ─────────────────────────────────────────────────────

function makeFluentMock(rows: unknown[], single: unknown = null) {
  const self: any = {
    select: () => self,
    eq: () => self,
    order: () => self,
    maybeSingle: async () => ({ data: single, error: null }),
    data: rows,
    error: null,
  };
  return self;
}

const DOMAIN_ROW = {
  id: 'd-1',
  canonical_domain: 'elitephysio.ca',
  display_name: 'Elite Physio',
  site_url: 'https://elitephysio.ca',
};

const CONFIG_ROW = {
  id: 'cfg-1',
  startup_workspace_id: 'ws-1',
  agency_account_id: null,
  benchmark_domain_id: 'd-1',
  topic: 'Vestibular Rehab',
  location: 'Vancouver',
  query_set_id: 'qs-1',
  competitor_list: ['physio.ca', 'balance.ca'],
  cadence: 'monthly',
  platforms_enabled: ['chatgpt', 'gemini'],
  report_email: 'client@example.com',
  metadata: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  benchmark_domains: { canonical_domain: 'elitephysio.ca', display_name: 'Elite Physio', site_url: 'https://elitephysio.ca' },
};

function makeSupabase(tableData: Record<string, unknown[]>, singleData: Record<string, unknown> = {}) {
  return {
    from(table: string) {
      return makeFluentMock(tableData[table] ?? [], singleData[table] ?? null);
    },
  };
}

// ── listAllConfigs ────────────────────────────────────────────────────────────

describe('createGpmAdminData', () => {
  it('listAllConfigs maps domain info', async () => {
    const supabase = makeSupabase({ client_benchmark_configs: [CONFIG_ROW] });
    const data = createGpmAdminData(supabase as any);
    const configs = await data.listAllConfigs();

    expect(configs).toHaveLength(1);
    expect(configs[0]!.domain_canonical).toBe('elitephysio.ca');
    expect(configs[0]!.domain_display).toBe('Elite Physio');
    expect(configs[0]!.competitor_list).toEqual(['physio.ca', 'balance.ca']);
  });

  it('listAllConfigs returns empty array when no configs', async () => {
    const supabase = makeSupabase({ client_benchmark_configs: [] });
    const data = createGpmAdminData(supabase as any);
    const configs = await data.listAllConfigs();
    expect(configs).toHaveLength(0);
  });

  it('getConfig returns null when not found', async () => {
    const supabase = { from: (_t: string) => makeFluentMock([], null) };
    const data = createGpmAdminData(supabase as any);
    const config = await data.getConfig('missing-id');
    expect(config).toBeNull();
  });

  it('getConfig maps domain info when found', async () => {
    const supabase = { from: (_t: string) => makeFluentMock([], CONFIG_ROW) };
    const data = createGpmAdminData(supabase as any);
    const config = await data.getConfig('cfg-1');
    expect(config).not.toBeNull();
    expect(config!.domain_canonical).toBe('elitephysio.ca');
    expect(config!.id).toBe('cfg-1');
  });

  it('getDomainOptions maps rows correctly', async () => {
    const supabase = makeSupabase({ benchmark_domains: [DOMAIN_ROW] });
    const data = createGpmAdminData(supabase as any);
    const opts = await data.getDomainOptions();
    expect(opts).toHaveLength(1);
    expect(opts[0]!.canonicalDomain).toBe('elitephysio.ca');
    expect(opts[0]!.displayName).toBe('Elite Physio');
  });

  it('getQuerySetOptions maps rows correctly', async () => {
    const supabase = makeSupabase({
      benchmark_query_sets: [{ id: 'qs-1', name: 'Physio Queries', version: 'v1', status: 'active' }],
    });
    const data = createGpmAdminData(supabase as any);
    const opts = await data.getQuerySetOptions();
    expect(opts).toHaveLength(1);
    expect(opts[0]!.name).toBe('Physio Queries');
    expect(opts[0]!.version).toBe('v1');
  });
});

// ── validateClientBenchmarkConfigInput — competitor list extension ─────────────

describe('validateClientBenchmarkConfigInput — competitorList', () => {
  const BASE_VALID = {
    topic: 'Vestibular Rehab',
    location: 'Vancouver',
    benchmarkDomainId: 'domain-uuid-1234',
    cadence: 'monthly' as const,
    platformsEnabled: ['chatgpt'],
    startupWorkspaceId: 'ws-uuid-1234',
    agencyAccountId: null,
  };

  it('accepts undefined competitorList', () => {
    const result = validateClientBenchmarkConfigInput(BASE_VALID);
    expect(result.valid).toBe(true);
  });

  it('accepts empty competitorList', () => {
    const result = validateClientBenchmarkConfigInput({ ...BASE_VALID, competitorList: [] });
    expect(result.valid).toBe(true);
  });

  it('accepts valid competitor list', () => {
    const result = validateClientBenchmarkConfigInput({
      ...BASE_VALID,
      competitorList: ['physio.ca', 'balance.com'],
    });
    expect(result.valid).toBe(true);
  });

  it('rejects competitor list exceeding 50 entries', () => {
    const result = validateClientBenchmarkConfigInput({
      ...BASE_VALID,
      competitorList: Array.from({ length: 51 }, (_, i) => `comp${i}.com`),
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('50'))).toBe(true);
  });

  it('rejects blank competitor entries', () => {
    const result = validateClientBenchmarkConfigInput({
      ...BASE_VALID,
      competitorList: ['physio.ca', '  '],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('blank'))).toBe(true);
  });

  it('accepts exactly 50 entries', () => {
    const result = validateClientBenchmarkConfigInput({
      ...BASE_VALID,
      competitorList: Array.from({ length: 50 }, (_, i) => `comp${i}.com`),
    });
    expect(result.valid).toBe(true);
  });
});

// ── mergeGpmBundleCaps ────────────────────────────────────────────────────────

describe('mergeGpmBundleCaps', () => {
  it('returns null for unknown bundle', () => {
    expect(mergeGpmBundleCaps('unknown_bundle')).toBeNull();
  });

  it('returns null for null bundleKey', () => {
    expect(mergeGpmBundleCaps(null)).toBeNull();
  });

  it('returns hardcoded caps when no override', () => {
    const caps = mergeGpmBundleCaps('startup_dev');
    expect(caps).not.toBeNull();
    expect(caps!.maxPromptsPerRun).toBe(10);
    expect(caps!.allowedCadences).toEqual(['monthly']);
    expect(caps!.deliverySurfaces).toEqual(['email']);
    expect(caps!.tier).toBe('startup_dev');
  });

  it('applies DB override for maxPromptsPerRun', () => {
    const caps = mergeGpmBundleCaps('startup_dev', {
      maxPromptsPerRun: 25,
      allowedCadences: ['monthly'],
      deliverySurfaces: ['email'],
    });
    expect(caps!.maxPromptsPerRun).toBe(25);
  });

  it('applies null maxPromptsPerRun (unlimited) override', () => {
    const caps = mergeGpmBundleCaps('startup_dev', {
      maxPromptsPerRun: null,
      allowedCadences: ['monthly'],
      deliverySurfaces: ['email'],
    });
    expect(caps!.maxPromptsPerRun).toBeNull();
  });

  it('applies cadence override', () => {
    const caps = mergeGpmBundleCaps('agency_core', {
      maxPromptsPerRun: 15,
      allowedCadences: ['monthly', 'biweekly', 'weekly'],
      deliverySurfaces: ['email', 'slack'],
    });
    expect(caps!.allowedCadences).toEqual(['monthly', 'biweekly', 'weekly']);
  });

  it('applies delivery surface override', () => {
    const caps = mergeGpmBundleCaps('agency_pro', {
      maxPromptsPerRun: null,
      allowedCadences: ['monthly', 'biweekly', 'weekly'],
      deliverySurfaces: ['email'],
    });
    expect(caps!.deliverySurfaces).toEqual(['email']);
  });

  it('falls back to hardcoded cadences when override has empty list', () => {
    const caps = mergeGpmBundleCaps('agency_core', {
      maxPromptsPerRun: 15,
      allowedCadences: [],
      deliverySurfaces: ['email', 'slack'],
    });
    expect(caps!.allowedCadences).toEqual(['monthly', 'biweekly']);
  });

  it('preserves tier from hardcoded caps', () => {
    const caps = mergeGpmBundleCaps('agency_pro', {
      maxPromptsPerRun: 5,
      allowedCadences: ['monthly'],
      deliverySurfaces: ['email'],
    });
    expect(caps!.tier).toBe('agency_pro');
  });
});

// ── getBundleCapOverrides ─────────────────────────────────────────────────────

describe('createGpmAdminData.getBundleCapOverrides', () => {
  function makeCapsMock(rows: unknown[]) {
    const self: any = {
      select: () => self,
      eq: () => self,
      data: rows,
      error: null,
    };
    return { from: (_t: string) => self };
  }

  it('returns empty object when no rows have gpm_caps metadata', async () => {
    const supabase = makeCapsMock([
      {
        metadata: { seed: 'gpm012' },
        service_bundles: { bundle_key: 'startup_dev' },
        service_catalog: { service_key: 'geo_performance_monitoring' },
      },
    ]);
    const data = createGpmAdminData(supabase as any);
    const overrides = await data.getBundleCapOverrides();
    expect(Object.keys(overrides)).toHaveLength(0);
  });

  it('parses gpm_caps metadata from matching rows', async () => {
    const supabase = makeCapsMock([
      {
        metadata: {
          seed: 'gpm012',
          gpm_caps: { maxPromptsPerRun: 20, allowedCadences: ['monthly'], deliverySurfaces: ['email'] },
        },
        service_bundles: { bundle_key: 'startup_dev' },
        service_catalog: { service_key: 'geo_performance_monitoring' },
      },
    ]);
    const data = createGpmAdminData(supabase as any);
    const overrides = await data.getBundleCapOverrides();
    expect(overrides['startup_dev']).toBeDefined();
    expect(overrides['startup_dev']!.maxPromptsPerRun).toBe(20);
    expect(overrides['startup_dev']!.allowedCadences).toEqual(['monthly']);
    expect(overrides['startup_dev']!.deliverySurfaces).toEqual(['email']);
  });

  it('handles null maxPromptsPerRun (unlimited) in metadata', async () => {
    const supabase = makeCapsMock([
      {
        metadata: {
          gpm_caps: { maxPromptsPerRun: null, allowedCadences: ['monthly', 'biweekly', 'weekly'], deliverySurfaces: ['email', 'slack', 'portal'] },
        },
        service_bundles: { bundle_key: 'agency_pro' },
        service_catalog: { service_key: 'geo_performance_monitoring' },
      },
    ]);
    const data = createGpmAdminData(supabase as any);
    const overrides = await data.getBundleCapOverrides();
    expect(overrides['agency_pro']!.maxPromptsPerRun).toBeNull();
  });

  it('skips rows with no bundle_key', async () => {
    const supabase = makeCapsMock([
      {
        metadata: { gpm_caps: { maxPromptsPerRun: 5, allowedCadences: ['monthly'], deliverySurfaces: ['email'] } },
        service_bundles: null,
        service_catalog: { service_key: 'geo_performance_monitoring' },
      },
    ]);
    const data = createGpmAdminData(supabase as any);
    const overrides = await data.getBundleCapOverrides();
    expect(Object.keys(overrides)).toHaveLength(0);
  });
});

// ── getReportsForConfig ───────────────────────────────────────────────────────

describe('createGpmAdminData.getReportsForConfig', () => {
  const REPORT_ROW = {
    id: 'rpt-1',
    config_id: 'cfg-1',
    run_group_id: 'rg-1',
    platform: 'chatgpt',
    window_date: '2026-04',
    pdf_r2_key: 'gpm-reports/cfg-1/2026-04-chatgpt.pdf',
    pdf_url: 'https://cdn.example.com/gpm-reports/cfg-1/2026-04-chatgpt.pdf',
    narrative_generated: true,
    generated_at: '2026-04-01T10:00:00Z',
  };

  it('returns mapped report rows', async () => {
    const supabase = makeSupabase({ gpm_reports: [REPORT_ROW] });
    const data = createGpmAdminData(supabase as any);
    const reports = await data.getReportsForConfig('cfg-1');
    expect(reports).toHaveLength(1);
    expect(reports[0]!.id).toBe('rpt-1');
    expect(reports[0]!.platform).toBe('chatgpt');
    expect(reports[0]!.window_date).toBe('2026-04');
    expect(reports[0]!.pdf_url).toBe('https://cdn.example.com/gpm-reports/cfg-1/2026-04-chatgpt.pdf');
    expect(reports[0]!.narrative_generated).toBe(true);
  });

  it('returns empty array when no reports exist', async () => {
    const supabase = makeSupabase({ gpm_reports: [] });
    const data = createGpmAdminData(supabase as any);
    const reports = await data.getReportsForConfig('cfg-missing');
    expect(reports).toHaveLength(0);
  });

  it('handles null pdf_url and pdf_r2_key', async () => {
    const supabase = makeSupabase({
      gpm_reports: [{ ...REPORT_ROW, pdf_url: null, pdf_r2_key: null }],
    });
    const data = createGpmAdminData(supabase as any);
    const reports = await data.getReportsForConfig('cfg-1');
    expect(reports[0]!.pdf_url).toBeNull();
    expect(reports[0]!.pdf_r2_key).toBeNull();
  });
});
