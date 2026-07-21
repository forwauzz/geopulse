import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchBrandLogo } from './fetch-brand-logo';
import { MAX_LOGO_BYTES } from '../scan-engine/parse-brand-signals';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);

function ok(bytes: Uint8Array, contentType: string): Response {
  return new Response(bytes.slice().buffer, { status: 200, headers: { 'Content-Type': contentType } });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchBrandLogo', () => {
  it('accepts a real PNG', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok(PNG, 'image/png')));
    const r = await fetchBrandLogo('https://example.com/logo.png');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mime).toBe('image/png');
  });

  it('accepts a real JPEG', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok(JPEG, 'image/jpeg')));
    const r = await fetchBrandLogo('https://example.com/logo.jpg');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.mime).toBe('image/jpeg');
  });

  it('rejects HTML served with a lying image/png Content-Type', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok(new TextEncoder().encode('<html>not an image</html>'), 'image/png'))
    );
    const r = await fetchBrandLogo('https://example.com/logo.png');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('PNG or JPEG');
  });

  it('rejects an SVG — pdf-lib cannot embed it', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok(new TextEncoder().encode('<svg xmlns="…"></svg>'), 'image/svg+xml'))
    );
    const r = await fetchBrandLogo('https://example.com/logo.svg');
    expect(r.ok).toBe(false);
  });

  it('rejects a body over MAX_LOGO_BYTES', async () => {
    const oversize = new Uint8Array(MAX_LOGO_BYTES + 1);
    oversize.set(PNG);
    vi.stubGlobal('fetch', vi.fn(async () => ok(oversize, 'image/png')));
    const r = await fetchBrandLogo('https://example.com/logo.png');
    expect(r.ok).toBe(false);
  });

  it('never fetches an internal URL', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const r = await fetchBrandLogo('http://192.168.1.1/logo.png');
    expect(r.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
});
