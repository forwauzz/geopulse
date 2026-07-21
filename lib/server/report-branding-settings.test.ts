import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getBrandSettingsView,
  importBrandLogoFromUrl,
  removeBrandLogo,
  saveBrandFields,
  storeBrandLogoBytes,
} from './report-branding-settings';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

function fakeSupabase(initialMetadata: Record<string, unknown>) {
  const state = { metadata: initialMetadata as unknown };
  return {
    state,
    from() {
      return {
        select() {
          return {
            eq() {
              return { maybeSingle: async () => ({ data: { metadata: state.metadata }, error: null }) };
            },
          };
        },
        update(values: Record<string, unknown>) {
          return {
            eq: async () => {
              state.metadata = values['metadata'];
              return { error: null };
            },
          };
        },
      };
    },
  };
}

function fakeBucket() {
  const objects = new Map<string, Uint8Array>();
  return {
    objects,
    async put(key: string, value: Uint8Array | ArrayBuffer) {
      objects.set(key, value instanceof Uint8Array ? value : new Uint8Array(value));
    },
    async delete(key: string) {
      objects.delete(key);
    },
  };
}

const scope = { table: 'startup_workspaces' as const, id: 'ws-1' };

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('saveBrandFields', () => {
  it('writes fields into metadata.brand and preserves the stored logo', async () => {
    const supabase = fakeSupabase({ brand: { logoKey: 'k.png', logoMime: 'image/png' }, other: 1 });
    const r = await saveBrandFields({
      supabase: supabase as never,
      scope,
      fields: { companyName: 'Acme', primaryHex: '#123456', footerNote: 'note', showPoweredBy: false },
    });
    expect(r.ok).toBe(true);
    const metadata = supabase.state.metadata as Record<string, unknown>;
    const brand = metadata['brand'] as Record<string, unknown>;
    expect(brand['companyName']).toBe('Acme');
    expect(brand['primary']).toBe('#123456');
    expect(brand['showPoweredBy']).toBe(false);
    expect(brand['logoKey']).toBe('k.png');
    expect(metadata['other']).toBe(1);
  });

  it('rejects a malformed colour without writing', async () => {
    const supabase = fakeSupabase({});
    const r = await saveBrandFields({
      supabase: supabase as never,
      scope,
      fields: { companyName: 'Acme', primaryHex: 'blurple', footerNote: '', showPoweredBy: true },
    });
    expect(r).toEqual({ ok: false, code: 'brand_invalid_color' });
    expect((supabase.state.metadata as Record<string, unknown>)['brand']).toBeUndefined();
  });
});

describe('storeBrandLogoBytes', () => {
  it('stores a PNG and points metadata at it', async () => {
    const supabase = fakeSupabase({});
    const bucket = fakeBucket();
    const r = await storeBrandLogoBytes({ supabase: supabase as never, bucket, scope, bytes: PNG });
    expect(r.ok).toBe(true);
    const key = 'brand-logos/startup_workspaces/ws-1/logo.png';
    expect(bucket.objects.has(key)).toBe(true);
    const brand = (supabase.state.metadata as Record<string, unknown>)['brand'] as Record<string, unknown>;
    expect(brand['logoKey']).toBe(key);
    expect(brand['logoMime']).toBe('image/png');
  });

  it('rejects bytes that are not PNG/JPEG regardless of claimed type', async () => {
    const supabase = fakeSupabase({});
    const bucket = fakeBucket();
    const r = await storeBrandLogoBytes({
      supabase: supabase as never,
      bucket,
      scope,
      bytes: new TextEncoder().encode('<svg></svg>'),
    });
    expect(r).toEqual({ ok: false, code: 'brand_logo_invalid' });
    expect(bucket.objects.size).toBe(0);
  });
});

describe('importBrandLogoFromUrl', () => {
  it('goes through the SSRF gate — internal URLs are never fetched', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const supabase = fakeSupabase({});
    const bucket = fakeBucket();
    const r = await importBrandLogoFromUrl({
      supabase: supabase as never,
      bucket,
      scope,
      url: 'http://169.254.169.254/logo.png',
    });
    expect(r).toEqual({ ok: false, code: 'brand_logo_fetch_failed' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('imports a valid remote PNG end to end', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(PNG.slice().buffer, { status: 200, headers: { 'Content-Type': 'image/png' } }))
    );
    const supabase = fakeSupabase({});
    const bucket = fakeBucket();
    const r = await importBrandLogoFromUrl({
      supabase: supabase as never,
      bucket,
      scope,
      url: 'https://example.com/logo.png',
    });
    expect(r.ok).toBe(true);
    expect(bucket.objects.size).toBe(1);
  });
});

describe('removeBrandLogo', () => {
  it('clears the pointer and deletes the object', async () => {
    const supabase = fakeSupabase({ brand: { companyName: 'Acme', logoKey: 'k.png', logoMime: 'image/png' } });
    const bucket = fakeBucket();
    bucket.objects.set('k.png', PNG);
    const r = await removeBrandLogo({ supabase: supabase as never, bucket, scope });
    expect(r.ok).toBe(true);
    expect(bucket.objects.has('k.png')).toBe(false);
    const brand = (supabase.state.metadata as Record<string, unknown>)['brand'] as Record<string, unknown>;
    expect(brand['logoKey']).toBeUndefined();
    expect(brand['companyName']).toBe('Acme');
  });
});

describe('getBrandSettingsView', () => {
  it('returns form defaults and a public preview URL', async () => {
    const supabase = fakeSupabase({
      brand: { companyName: 'Acme', primary: '#123456', logoKey: 'brand-logos/x/logo.png', logoMime: 'image/png' },
    });
    const view = await getBrandSettingsView({
      supabase: supabase as never,
      scope,
      publicBase: 'https://pub.example.com',
    });
    expect(view.companyName).toBe('Acme');
    expect(view.primaryHex).toBe('#123456');
    expect(view.showPoweredBy).toBe(true);
    expect(view.logoUrl).toBe('https://pub.example.com/brand-logos/x/logo.png');
  });
});
