import { describe, expect, it, vi } from 'vitest';
import {
  browserRenderConfigFromEnv,
  createCloudflareBrowserRenderClient,
  hasBrowserRenderingCredentials,
  looksLikeSpaShell,
  parseBrowserRenderMode,
  renderedHtmlImprovesContent,
  shouldUseBrowserRendering,
} from './browser-rendering';

describe('parseBrowserRenderMode', () => {
  it('defaults unknown values to off', () => {
    expect(parseBrowserRenderMode(undefined)).toBe('off');
    expect(parseBrowserRenderMode('weird')).toBe('off');
  });

  it('parses supported modes', () => {
    expect(parseBrowserRenderMode('auto')).toBe('auto');
    expect(parseBrowserRenderMode('force')).toBe('force');
  });
});

describe('browserRenderConfigFromEnv', () => {
  it('supports the explicit mode env', () => {
    expect(
      browserRenderConfigFromEnv({
        DEEP_AUDIT_BROWSER_RENDER_MODE: 'auto',
        CLOUDFLARE_ACCOUNT_ID: 'acct',
        BROWSER_RENDERING_API_TOKEN: 'token',
      })
    ).toEqual({
      mode: 'auto',
      accountId: 'acct',
      apiToken: 'token',
    });
  });

  it('keeps legacy enabled flag compatible', () => {
    expect(
      browserRenderConfigFromEnv({
        DEEP_AUDIT_BROWSER_RENDERING_ENABLED: 'true',
        CF_BROWSER_RENDERING_ACCOUNT_ID: 'acct',
        CF_BROWSER_RENDERING_API_TOKEN: 'token',
      })
    ).toEqual({
      mode: 'auto',
      accountId: 'acct',
      apiToken: 'token',
    });
  });
});

describe('looksLikeSpaShell', () => {
  it('detects sparse app shells with many scripts', () => {
    const html = `
      <html><body>
        <div id="root"></div>
        <script src="/a.js"></script>
        <script src="/b.js"></script>
        <script src="/c.js"></script>
        <script src="/d.js"></script>
        <script src="/e.js"></script>
        <script src="/f.js"></script>
      </body></html>
    `;
    expect(looksLikeSpaShell(html)).toBe(true);
  });

  it('does not flag content-rich html as a spa shell', () => {
    const html = `
      <html><body>
        <main><h1>Guide</h1><p>${'text '.repeat(400)}</p></main>
        <a href="/docs">Docs</a>
      </body></html>
    `;
    expect(looksLikeSpaShell(html)).toBe(false);
  });
});

describe('renderedHtmlImprovesContent', () => {
  it('returns true when rendered text is materially richer', () => {
    const staticHtml = '<html><body><div id="app"></div><script src="/app.js"></script></body></html>';
    const renderedHtml = `<html><body><main><p>${'rendered '.repeat(120)}</p></main></body></html>`;
    expect(renderedHtmlImprovesContent(staticHtml, renderedHtml)).toBe(true);
  });

  it('returns false when rendered html is not better', () => {
    const staticHtml = `<html><body><main><p>${'useful '.repeat(120)}</p></main></body></html>`;
    const renderedHtml = `<html><body><main><p>${'useful '.repeat(100)}</p></main></body></html>`;
    expect(renderedHtmlImprovesContent(staticHtml, renderedHtml)).toBe(false);
  });
});

describe('shouldUseBrowserRendering', () => {
  it('requires credentials in auto mode', () => {
    const html = '<div id="root"></div><script src="/a.js"></script><script src="/b.js"></script><script src="/c.js"></script><script src="/d.js"></script><script src="/e.js"></script><script src="/f.js"></script>';
    expect(shouldUseBrowserRendering({ mode: 'auto', accountId: null, apiToken: null }, html)).toBe(false);
    expect(hasBrowserRenderingCredentials({ mode: 'auto', accountId: 'acct', apiToken: 'token' })).toBe(true);
  });

  it('always renders in force mode when configured', () => {
    expect(
      shouldUseBrowserRendering(
        { mode: 'force', accountId: 'acct', apiToken: 'token' },
        '<html><body><main>content already present</main></body></html>'
      )
    ).toBe(true);
  });
});

describe('createCloudflareBrowserRenderClient', () => {
  it('returns null when browser rendering is not configured', () => {
    const client = createCloudflareBrowserRenderClient({});
    expect(client).toBeNull();
  });

  it('posts to Cloudflare browser rendering content endpoint', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          success: true,
          result: { content: '<html><body><main>Rendered</main></body></html>' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json', 'X-Browser-Ms-Used': '42' } }
      )
    );

    const client = createCloudflareBrowserRenderClient(
      {
        DEEP_AUDIT_BROWSER_RENDER_MODE: 'auto',
        CLOUDFLARE_ACCOUNT_ID: 'acct_123',
        BROWSER_RENDERING_API_TOKEN: 'token_123',
      },
      { fetchImpl: fetchImpl as unknown as typeof fetch }
    );

    expect(client).not.toBeNull();
    const result = await client?.renderHtml('https://example.com/app');
    expect(result).toEqual({ ok: true, html: '<html><body><main>Rendered</main></body></html>', browserMsUsed: 42 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const firstArg = (fetchImpl.mock.calls as unknown[][])[0]?.[0];
    expect(firstArg).toBeTypeOf('string');
    expect(String(firstArg)).toContain(
      'https://api.cloudflare.com/client/v4/accounts/acct_123/browser-rendering/content'
    );
  });
});
