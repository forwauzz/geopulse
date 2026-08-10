import {
  browserRenderConfigFromEnv,
  hasBrowserRenderingCredentials,
  type BrowserRenderEnv,
} from '../scan-engine/browser-rendering';

const THUMBNAIL_TIMEOUT_MS = 20_000;
const THUMBNAIL_MAX_BYTES = 3_000_000;

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function safeAccent(value: string | null | undefined): string {
  return /^#[0-9a-f]{6}$/i.test(value ?? '') ? String(value) : '#565E74';
}

/** Email-safe visual twin of page one. All prospect-controlled values are escaped. */
export function buildAuditCampaignThumbnailHtml(input: {
  firstName: string;
  company: string;
  domain: string;
  generatedAt: string;
  primaryHex?: string | null;
  heroImage?: Uint8Array | null;
}): string {
  const accent = safeAccent(input.primaryHex);
  const hero = input.heroImage?.length
    ? `data:image/png;base64,${Buffer.from(input.heroImage).toString('base64')}`
    : null;
  const heroMarkup = hero
    ? `<img src="${hero}" alt="" style="display:block;width:100%;height:250px;object-fit:cover;object-position:top center;"/>`
    : `<div style="height:250px;background:linear-gradient(135deg,${accent},#1A1A1A);display:flex;align-items:center;justify-content:center;color:#fff;font-size:24px;font-weight:700;letter-spacing:.02em;">${escapeHtml(input.domain)}</div>`;

  return `<!doctype html><html><head><meta charset="utf-8"><style>*{box-sizing:border-box}html,body{margin:0;width:600px;height:776px;overflow:hidden;background:#fff}body{font-family:Arial,sans-serif;color:#1A1A1A}.page{position:relative;width:600px;height:776px;padding:42px 48px 36px}.top{display:flex;justify-content:space-between;align-items:center;font-size:12px;font-weight:700}.private{font-size:8px;color:#586162;letter-spacing:.08em}.eyebrow{margin-top:48px;color:${accent};font-size:10px;font-weight:700;letter-spacing:.16em}.title{margin:13px 0 22px;max-width:500px;font-size:34px;line-height:1.08;letter-spacing:-.035em}.hero{overflow:hidden;width:504px;height:250px;border-radius:3px;background:#F1F4F4}.for{margin:22px 0 0;font-size:14px;font-weight:700}.meta{margin:8px 0 0;color:#586162;font-size:11px}.value{margin:18px 0 0;color:${accent};font-size:10px;font-weight:700;letter-spacing:.02em}.foot{position:absolute;left:48px;right:48px;bottom:36px;display:flex;justify-content:space-between;color:#586162;font-size:8px}</style></head><body><main class="page"><div class="top"><span>${escapeHtml(input.company)}</span><span class="private">PRIVATE AUDIT&nbsp; / &nbsp;PREPARED BY GEO-PULSE</span></div><div class="eyebrow">AI SEARCH READINESS AUDIT</div><h1 class="title">What AI systems can understand about ${escapeHtml(input.company)}</h1><div class="hero">${heroMarkup}</div><p class="for">Prepared for ${escapeHtml(input.firstName)} at ${escapeHtml(input.company)}</p><p class="meta">${escapeHtml(input.domain)} &nbsp;/&nbsp; ${escapeHtml(input.generatedAt.slice(0, 10))}</p><p class="value">Observed gaps &nbsp;/&nbsp; prioritized fixes &nbsp;/&nbsp; assigned owners &nbsp;/&nbsp; fresh-scan verification</p><div class="foot"><span>Prepared by the GEO-Pulse team — Montréal, Québec</span><strong>01 / 10</strong></div></main></body></html>`;
}

export async function renderAuditCampaignThumbnail(args: {
  env: BrowserRenderEnv;
  html: string;
  fetchImpl?: typeof fetch;
}): Promise<Uint8Array | null> {
  const config = browserRenderConfigFromEnv(args.env);
  if (config.mode === 'off' || !hasBrowserRenderingCredentials(config)) return null;
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${config.accountId ?? ''}/browser-rendering/screenshot?cacheTTL=86400`;
  try {
    const response = await (args.fetchImpl ?? fetch)(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiToken ?? ''}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        html: args.html,
        screenshotOptions: { type: 'jpeg', quality: 92, fullPage: false },
        viewport: { width: 600, height: 776 },
        waitForTimeout: 100,
      }),
      signal: AbortSignal.timeout(THUMBNAIL_TIMEOUT_MS),
    });
    if (!response.ok || !(response.headers.get('content-type') ?? '').includes('image/')) return null;
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength === 0 || bytes.byteLength > THUMBNAIL_MAX_BYTES) return null;
    return new Uint8Array(bytes);
  } catch {
    return null;
  }
}
