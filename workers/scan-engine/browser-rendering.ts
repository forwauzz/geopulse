import { buildTextSample } from './parse-signals';
import { validateEngineFetchUrl } from '../lib/ssrf';

const DEFAULT_TIMEOUT_MS = 20_000;
const RENDERED_HTML_MIN_TEXT_DELTA = 250;
const RENDERED_LINK_MIN_DELTA = 5;

export type BrowserRenderMode = 'off' | 'auto' | 'force';

export interface BrowserRenderClient {
  renderHtml(
    url: string
  ): Promise<{ ok: true; html: string; browserMsUsed: number | null } | { ok: false; reason: string }>;
}

export type BrowserRenderEnv = {
  BROWSER_RENDERING_API_TOKEN?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  DEEP_AUDIT_BROWSER_RENDER_MODE?: string;
  CF_BROWSER_RENDERING_ACCOUNT_ID?: string;
  CF_BROWSER_RENDERING_API_TOKEN?: string;
  DEEP_AUDIT_BROWSER_RENDERING_ENABLED?: string;
};

export type BrowserRenderConfig = {
  readonly mode: BrowserRenderMode;
  readonly accountId: string | null;
  readonly apiToken: string | null;
};

function countAnchors(html: string): number {
  const matches = html.match(/<a\b/gi);
  return matches?.length ?? 0;
}

export function parseBrowserRenderMode(raw: string | undefined): BrowserRenderMode {
  const value = raw?.trim().toLowerCase() ?? '';
  if (value === 'auto') return 'auto';
  if (value === 'force') return 'force';
  return 'off';
}

export function browserRenderConfigFromEnv(env: BrowserRenderEnv): BrowserRenderConfig {
  const explicitMode = parseBrowserRenderMode(env.DEEP_AUDIT_BROWSER_RENDER_MODE);
  const legacyEnabled = env.DEEP_AUDIT_BROWSER_RENDERING_ENABLED?.trim().toLowerCase();
  const mode =
    explicitMode !== 'off'
      ? explicitMode
      : legacyEnabled === '1' || legacyEnabled === 'true' || legacyEnabled === 'yes' || legacyEnabled === 'on'
        ? 'auto'
        : 'off';

  return {
    mode,
    accountId: env.CLOUDFLARE_ACCOUNT_ID?.trim() || env.CF_BROWSER_RENDERING_ACCOUNT_ID?.trim() || null,
    apiToken: env.BROWSER_RENDERING_API_TOKEN?.trim() || env.CF_BROWSER_RENDERING_API_TOKEN?.trim() || null,
  };
}

export function hasBrowserRenderingCredentials(config: BrowserRenderConfig): boolean {
  return Boolean(config.accountId && config.apiToken);
}

export function looksLikeSpaShell(html: string): boolean {
  const textLength = buildTextSample(html, 2_500).length;
  const scriptCount = (html.match(/<script\b/gi) ?? []).length;
  const rootShell =
    /<div[^>]+id=["'](?:root|app|__next)["'][^>]*>\s*<\/div>/i.test(html) ||
    /<main[^>]*>\s*<\/main>/i.test(html) ||
    /data-reactroot/i.test(html) ||
    /ng-version=/i.test(html) ||
    /__NEXT_DATA__/i.test(html);
  return textLength < 600 && (rootShell || scriptCount >= 6);
}

export function renderedHtmlImprovesContent(staticHtml: string, renderedHtml: string): boolean {
  const staticTextLength = buildTextSample(staticHtml, 12_000).length;
  const renderedTextLength = buildTextSample(renderedHtml, 12_000).length;
  const staticAnchors = countAnchors(staticHtml);
  const renderedAnchors = countAnchors(renderedHtml);

  if (renderedTextLength >= staticTextLength + RENDERED_HTML_MIN_TEXT_DELTA) return true;
  if (renderedAnchors >= staticAnchors + RENDERED_LINK_MIN_DELTA) return true;
  return false;
}

export function shouldUseBrowserRendering(config: BrowserRenderConfig, html: string): boolean {
  if (config.mode === 'off' || !hasBrowserRenderingCredentials(config)) return false;
  if (config.mode === 'force') return true;
  return looksLikeSpaShell(html);
}

export function createCloudflareBrowserRenderClient(
  env: BrowserRenderEnv,
  deps?: { fetchImpl?: typeof fetch }
): BrowserRenderClient | null {
  const config = browserRenderConfigFromEnv(env);
  if (config.mode === 'off' || !config.accountId || !config.apiToken) return null;

  const fetchImpl = deps?.fetchImpl ?? fetch;
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${config.accountId}/browser-rendering/content?cacheTTL=0`;

  return {
    async renderHtml(url: string) {
      const validation = await validateEngineFetchUrl(url);
      if (!validation.ok) return validation;

      try {
        const response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: validation.safeUrl,
            rejectResourceTypes: ['image', 'media', 'font'],
          }),
          signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
        });

        if (!response.ok) {
          return { ok: false as const, reason: `browser_render_http_${String(response.status)}` };
        }

        const payload = (await response.json()) as {
          success?: boolean;
          errors?: { message?: string }[];
          result?: { content?: string | null } | string | null;
        };

        const html =
          typeof payload.result === 'string'
            ? payload.result
            : typeof payload.result?.content === 'string'
              ? payload.result.content
              : '';
        if (!payload.success || !html) {
          const message = payload.errors?.[0]?.message?.trim();
          return { ok: false as const, reason: message || 'browser_render_empty_content' };
        }

        const browserMsRaw = response.headers.get('X-Browser-Ms-Used');
        const browserMsUsed = browserMsRaw && !Number.isNaN(Number(browserMsRaw)) ? Number(browserMsRaw) : null;

        return { ok: true as const, html, browserMsUsed };
      } catch {
        return { ok: false as const, reason: 'browser_render_failed' };
      }
    },
  };
}
