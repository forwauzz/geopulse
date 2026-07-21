import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchGateBytes } from './fetch-gate';

const PNG_MAGIC = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

function binaryResponse(bytes: Uint8Array, init?: ResponseInit): Response {
  return new Response(bytes.slice().buffer, {
    status: 200,
    headers: { 'Content-Type': 'image/png' },
    ...init,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchGateBytes', () => {
  it('rejects internal addresses without fetching', async () => {
    const spy = vi.fn();
    vi.stubGlobal('fetch', spy);
    const r = await fetchGateBytes('https://169.254.169.254/latest/meta-data/', {
      maxBytes: 1024,
      acceptHeader: 'image/png',
    });
    expect(r.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects a redirect that lands on an internal address', async () => {
    const spy = vi.fn(async () =>
      new Response(null, { status: 302, headers: { Location: 'http://10.0.0.1/secret' } })
    );
    vi.stubGlobal('fetch', spy);
    const r = await fetchGateBytes('https://example.com/logo.png', {
      maxBytes: 1024,
      acceptHeader: 'image/png',
    });
    expect(r.ok).toBe(false);
    // The redirect target must never be fetched.
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('follows a valid redirect and returns the final URL', async () => {
    const spy = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(null, { status: 301, headers: { Location: 'https://cdn.example.com/logo.png' } })
      )
      .mockResolvedValueOnce(binaryResponse(PNG_MAGIC));
    vi.stubGlobal('fetch', spy);
    const r = await fetchGateBytes('https://example.com/logo.png', {
      maxBytes: 1024,
      acceptHeader: 'image/png',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.finalUrl).toBe('https://cdn.example.com/logo.png');
      expect([...r.bytes]).toEqual([...PNG_MAGIC]);
    }
  });

  it('fails (not truncates) when the body exceeds maxBytes', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => binaryResponse(new Uint8Array(64))));
    const r = await fetchGateBytes('https://example.com/logo.png', {
      maxBytes: 16,
      acceptHeader: 'image/png',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('size limit');
  });

  it('fails early on an oversize declared Content-Length', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        binaryResponse(new Uint8Array(4), {
          headers: { 'Content-Type': 'image/png', 'Content-Length': '99999999' },
        })
      )
    );
    const r = await fetchGateBytes('https://example.com/logo.png', {
      maxBytes: 1024,
      acceptHeader: 'image/png',
    });
    expect(r.ok).toBe(false);
  });

  it('fails on a non-2xx status', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 404 })));
    const r = await fetchGateBytes('https://example.com/logo.png', {
      maxBytes: 1024,
      acceptHeader: 'image/png',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain('404');
  });

  it('gives up after too many redirects', async () => {
    let n = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        n += 1;
        return new Response(null, {
          status: 302,
          headers: { Location: `https://example.com/hop-${n}` },
        });
      })
    );
    const r = await fetchGateBytes('https://example.com/logo.png', {
      maxBytes: 1024,
      acceptHeader: 'image/png',
    });
    expect(r.ok).toBe(false);
  });
});
