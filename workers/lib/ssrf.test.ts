import { describe, expect, it } from 'vitest';
import { validateEngineFetchUrl, validateRedirect, validateUrl } from './ssrf';

describe('validateUrl', () => {
  it('rejects http', async () => {
    const r = await validateUrl('http://example.com/');
    expect(r.ok).toBe(false);
  });

  it('rejects localhost', async () => {
    const r = await validateUrl('https://localhost/foo');
    expect(r.ok).toBe(false);
  });

  it('rejects link-local / metadata-style host', async () => {
    const r = await validateUrl('https://169.254.169.254/latest/meta-data/');
    expect(r.ok).toBe(false);
  });

  it('rejects private 10.x literal hostname', async () => {
    const r = await validateUrl('https://10.0.0.1/');
    expect(r.ok).toBe(false);
  });

  it('rejects IPv6 loopback', async () => {
    const r = await validateUrl('https://[::1]/');
    expect(r.ok).toBe(false);
  });

  it('rejects .local TLD', async () => {
    const r = await validateUrl('https://printer.local/');
    expect(r.ok).toBe(false);
  });

  it('accepts public https URL', async () => {
    const r = await validateUrl('https://www.example.com/path?q=1');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.safeUrl).toContain('example.com');
    }
  });

  it('rejects credentials in URL', async () => {
    const r = await validateUrl('https://user:pass@example.com/');
    expect(r.ok).toBe(false);
  });
});

describe('validateEngineFetchUrl', () => {
  it('allows http on default port', async () => {
    const r = await validateEngineFetchUrl('http://example.com/path');
    expect(r.ok).toBe(true);
  });

  it('rejects http on non-80 port', async () => {
    const r = await validateEngineFetchUrl('http://example.com:8080/');
    expect(r.ok).toBe(false);
  });
});

describe('validateRedirect', () => {
  it('resolves relative Location against original URL', async () => {
    const r = await validateRedirect('/next', 'https://example.com/start', 0);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.safeUrl).toBe('https://example.com/next');
  });

  it('rejects too many redirects', async () => {
    const r = await validateRedirect('https://example.com/a', 'https://example.com/b', 5);
    expect(r.ok).toBe(false);
  });
});
