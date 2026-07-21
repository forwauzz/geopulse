import { describe, expect, it } from 'vitest';
import { resolveReportBrand } from './resolve-report-brand';
import { GEO_PULSE_BRAND } from './report-branding';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function fakeSupabase(rows: Record<string, Record<string, unknown>>) {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq(_col: string, id: string) {
              return {
                maybeSingle: async () => {
                  const metadata = rows[table]?.[id];
                  return metadata === undefined
                    ? { data: null, error: null }
                    : { data: { metadata }, error: null };
                },
              };
            },
          };
        },
      };
    },
  } as never;
}

function fakeBucket(objects: Record<string, Uint8Array>) {
  return {
    async get(key: string) {
      const bytes = objects[key];
      if (!bytes) return null;
      return { arrayBuffer: async () => bytes.slice().buffer as ArrayBuffer };
    },
  };
}

const noScan = { agency_client_id: null, agency_account_id: null, startup_workspace_id: null };

describe('resolveReportBrand', () => {
  it('defaults to GEO-Pulse when the scan has no owner', async () => {
    const r = await resolveReportBrand({ supabase: fakeSupabase({}), scan: noScan, bucket: null });
    expect(r.brand).toBe(GEO_PULSE_BRAND);
    expect(r.logoBytes).toBeNull();
  });

  it('defaults when the owner has no brand in metadata', async () => {
    const supabase = fakeSupabase({ startup_workspaces: { 'ws-1': { other: true } } });
    const r = await resolveReportBrand({
      supabase,
      scan: { ...noScan, startup_workspace_id: 'ws-1' },
      bucket: null,
    });
    expect(r.brand).toBe(GEO_PULSE_BRAND);
  });

  it('uses the workspace brand and loads its logo from R2', async () => {
    const supabase = fakeSupabase({
      startup_workspaces: {
        'ws-1': {
          brand: { companyName: 'Acme', primary: '#123456', logoKey: 'brand-logos/ws-1/logo.png', logoMime: 'image/png' },
        },
      },
    });
    const bucket = fakeBucket({ 'brand-logos/ws-1/logo.png': PNG });
    const r = await resolveReportBrand({
      supabase,
      scan: { ...noScan, startup_workspace_id: 'ws-1' },
      bucket,
    });
    expect(r.brand.companyName).toBe('Acme');
    expect(r.logoBytes).not.toBeNull();
  });

  it('prefers the client brand over the agency brand', async () => {
    const supabase = fakeSupabase({
      agency_clients: { 'cl-1': { brand: { companyName: 'Client Co' } } },
      agency_accounts: { 'ag-1': { brand: { companyName: 'Agency Co' } } },
    });
    const r = await resolveReportBrand({
      supabase,
      scan: { agency_client_id: 'cl-1', agency_account_id: 'ag-1', startup_workspace_id: null },
      bucket: null,
    });
    expect(r.brand.companyName).toBe('Client Co');
  });

  it('falls through to the agency brand when the client has none', async () => {
    const supabase = fakeSupabase({
      agency_clients: { 'cl-1': {} },
      agency_accounts: { 'ag-1': { brand: { companyName: 'Agency Co' } } },
    });
    const r = await resolveReportBrand({
      supabase,
      scan: { agency_client_id: 'cl-1', agency_account_id: 'ag-1', startup_workspace_id: null },
      bucket: null,
    });
    expect(r.brand.companyName).toBe('Agency Co');
  });

  it('drops logo bytes when the R2 object is not the declared image type', async () => {
    const supabase = fakeSupabase({
      startup_workspaces: {
        'ws-1': { brand: { companyName: 'Acme', logoKey: 'k.png', logoMime: 'image/png' } },
      },
    });
    const bucket = fakeBucket({ 'k.png': new TextEncoder().encode('<html>swapped</html>') });
    const r = await resolveReportBrand({
      supabase,
      scan: { ...noScan, startup_workspace_id: 'ws-1' },
      bucket,
    });
    expect(r.brand.companyName).toBe('Acme');
    expect(r.logoBytes).toBeNull();
  });

  it('survives a missing R2 object', async () => {
    const supabase = fakeSupabase({
      startup_workspaces: {
        'ws-1': { brand: { companyName: 'Acme', logoKey: 'gone.png', logoMime: 'image/png' } },
      },
    });
    const r = await resolveReportBrand({
      supabase,
      scan: { ...noScan, startup_workspace_id: 'ws-1' },
      bucket: fakeBucket({}),
    });
    expect(r.logoBytes).toBeNull();
  });
});
