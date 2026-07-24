/**
 * Jordan — deterministic social art direction and rendering.
 *
 * Browser Run renders controlled first-party HTML into provider-ready JPEGs. No source
 * artwork is downloaded or copied. R2 stores immutable dated assets for Instagram.
 */

export type SocialCardKind = 'timely' | 'humor' | 'carousel' | 'proof' | 'educational';

export type SocialCardBrief = {
  readonly key: string;
  readonly kind: SocialCardKind;
  readonly eyebrow: string;
  readonly headline: string;
  readonly supportingText: string;
  readonly sourceLabel?: string | null;
  readonly bullets?: readonly string[];
};

export type SocialRenderedMedia = {
  readonly storageUrl: string;
  readonly mimeType: 'image/jpeg';
  readonly altText: string;
  readonly sortOrder: number;
  readonly mediaKind: 'image' | 'carousel_slide';
  readonly metadata: Record<string, unknown>;
};

export type BrowserRunBinding = {
  quickAction(
    action: 'screenshot',
    input: Record<string, unknown>
  ): Promise<Response>;
};

export type SocialMediaBucket = {
  put(
    key: string,
    value: ArrayBuffer,
    options?: { httpMetadata?: { contentType?: string; cacheControl?: string } }
  ): Promise<unknown>;
};

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function clean(value: string, max: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max);
}

function palette(kind: SocialCardKind): { bg: string; panel: string; accent: string; ink: string } {
  if (kind === 'humor') {
    return { bg: '#111310', panel: '#1b1e19', accent: '#f2cf73', ink: '#f7f2e6' };
  }
  if (kind === 'proof') {
    return { bg: '#f3efe3', panel: '#fffdf7', accent: '#1f6d55', ink: '#171a17' };
  }
  if (kind === 'carousel') {
    return { bg: '#ede7d7', panel: '#faf7ed', accent: '#a06d18', ink: '#171a17' };
  }
  return { bg: '#f6f1e5', panel: '#fffdf8', accent: '#b8862c', ink: '#151816' };
}

function socialCardHtml(
  brief: SocialCardBrief,
  slide: { index: number; total: number; headline: string; supportingText: string }
): string {
  const colors = palette(brief.kind);
  const bullets = (brief.bullets ?? []).slice(0, 5);
  const source = brief.sourceLabel ? escapeHtml(clean(brief.sourceLabel, 80)) : '';
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
*{box-sizing:border-box}html,body{margin:0;width:1080px;height:1350px;overflow:hidden}
body{font-family:Inter,Arial,sans-serif;background:${colors.bg};color:${colors.ink}}
.page{position:relative;width:1080px;height:1350px;padding:76px}
.grid{position:absolute;inset:0;opacity:.14;background-image:linear-gradient(${colors.accent} 1px,transparent 1px),linear-gradient(90deg,${colors.accent} 1px,transparent 1px);background-size:72px 72px}
.orb{position:absolute;width:430px;height:430px;border-radius:50%;right:-120px;top:-110px;background:${colors.accent};opacity:.16;filter:blur(2px)}
.panel{position:relative;height:100%;border:2px solid ${colors.accent}55;border-radius:38px;background:${colors.panel};padding:64px;display:flex;flex-direction:column;box-shadow:0 32px 80px #00000016}
.top{display:flex;align-items:center;justify-content:space-between}
.brand{font-size:25px;font-weight:900;letter-spacing:-.5px}.brand span{color:${colors.accent}}
.count{font-size:22px;font-weight:800;color:${colors.accent}}
.eyebrow{margin-top:100px;font-size:23px;font-weight:850;letter-spacing:3px;text-transform:uppercase;color:${colors.accent}}
h1{margin:24px 0 0;font-size:${brief.kind === 'humor' ? 80 : 72}px;line-height:.99;letter-spacing:-3.6px;max-width:870px}
.rule{width:130px;height:8px;border-radius:99px;background:${colors.accent};margin:42px 0 30px}
.support{font-size:30px;line-height:1.4;max-width:820px;color:${colors.ink}cc}
ul{list-style:none;margin:28px 0 0;padding:0;display:grid;gap:18px}
li{font-size:29px;line-height:1.25;display:flex;gap:17px}
li:before{content:'→';font-weight:900;color:${colors.accent}}
.bottom{margin-top:auto;display:flex;align-items:end;justify-content:space-between;gap:30px}
.source{font-size:20px;line-height:1.25;color:${colors.ink}88;max-width:620px}
.mark{width:70px;height:70px;border-radius:22px;background:${colors.ink};color:${colors.accent};display:grid;place-items:center;font-weight:950;font-size:24px}
</style></head><body><div class="page"><div class="grid"></div><div class="orb"></div>
<main class="panel"><div class="top"><div class="brand">GEO<span>•</span>Pulse</div><div class="count">${slide.index + 1}/${slide.total}</div></div>
<div class="eyebrow">${escapeHtml(clean(brief.eyebrow, 45))}</div>
<h1>${escapeHtml(clean(slide.headline, 115))}</h1><div class="rule"></div>
<div class="support">${escapeHtml(clean(slide.supportingText, 250))}</div>
${bullets.length > 0 ? `<ul>${bullets.map((item) => `<li>${escapeHtml(clean(item, 100))}</li>`).join('')}</ul>` : ''}
<div class="bottom"><div class="source">${source ? `Source used for research: ${source}` : 'See how AI systems understand your business.'}</div><div class="mark">GEO</div></div>
</main></div></body></html>`;
}

function slidesFor(brief: SocialCardBrief): {
  index: number;
  total: number;
  headline: string;
  supportingText: string;
}[] {
  if (brief.kind !== 'carousel') {
    return [{ index: 0, total: 1, headline: brief.headline, supportingText: brief.supportingText }];
  }
  const bullets = (brief.bullets ?? []).slice(0, 4);
  const rows = [
    { headline: brief.headline, supportingText: brief.supportingText },
    ...bullets.map((bullet, index) => ({
      headline: `${index + 1}. ${bullet}`,
      supportingText: 'Use this as a practical check, then verify it against the actual site and report.',
    })),
    {
      headline: 'Run the check on a real site.',
      supportingText: 'GEO-Pulse shows what AI systems can understand, what they may miss, and what to fix first.',
    },
  ].slice(0, 6);
  return rows.map((row, index) => ({ ...row, index, total: rows.length }));
}

function normalizedPublicBase(value: string): string {
  return value.replace(/\/+$/, '');
}

export async function renderSocialCardSet(args: {
  readonly browser: BrowserRunBinding;
  readonly bucket: SocialMediaBucket;
  readonly publicBase: string;
  readonly brief: SocialCardBrief;
  readonly dateKey: string;
}): Promise<SocialRenderedMedia[]> {
  const safeKey = args.brief.key.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').slice(0, 100);
  const slides = slidesFor(args.brief);
  const rendered: SocialRenderedMedia[] = [];

  for (const slide of slides) {
    const response = await args.browser.quickAction('screenshot', {
      html: socialCardHtml(args.brief, slide),
      viewport: { width: 1080, height: 1350, deviceScaleFactor: 1 },
      screenshotOptions: {
        type: 'jpeg',
        quality: 92,
        fullPage: false,
        captureBeyondViewport: false,
      },
    });
    if (!response.ok) {
      throw new Error(`browser_render_http_${response.status}`);
    }
    const bytes = await response.arrayBuffer();
    if (bytes.byteLength < 10_000) throw new Error('browser_render_invalid_jpeg');
    const key = `social/jordan/${args.dateKey}/${safeKey}-${slide.index + 1}.jpg`;
    await args.bucket.put(key, bytes, {
      httpMetadata: {
        contentType: 'image/jpeg',
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });
    rendered.push({
      storageUrl: `${normalizedPublicBase(args.publicBase)}/${key}`,
      mimeType: 'image/jpeg',
      altText: clean(`${args.brief.headline}. ${slide.supportingText}`, 500),
      sortOrder: slide.index,
      mediaKind: slides.length > 1 ? 'carousel_slide' : 'image',
      metadata: {
        generated_by: 'jordan',
        renderer: 'cloudflare_browser_run',
        width: 1080,
        height: 1350,
        aspect_ratio: '4:5',
        feed_safe: true,
        profile_grid_safe: true,
        text_safe_area: 'central_84_percent',
        original_asset: true,
      },
    });
  }
  return rendered;
}

