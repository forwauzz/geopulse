import { describe, expect, it, vi } from 'vitest';
import { buildAuditCampaignThumbnailHtml, renderAuditCampaignThumbnail } from './audit-campaign-thumbnail';

describe('audit campaign email thumbnail', () => {
  it('escapes recipient data and keeps the first-page promise visible', () => {
    const html = buildAuditCampaignThumbnailHtml({
      firstName: '<James>', company: 'A & B <script>', domain: 'a.example', generatedAt: '2026-08-10T12:00:00Z', primaryHex: '#123456', heroImage: null,
    });
    expect(html).toContain('Prepared for &lt;James&gt; at A &amp; B &lt;script&gt;');
    expect(html).not.toContain('<script>');
    expect(html).toContain('01 / 10');
    expect(html).toContain('#123456');
  });

  it('requests a deterministic JPEG from Browser Rendering', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      expect(body.html).toContain('PRIVATE AUDIT');
      expect(body.viewport).toEqual({ width: 600, height: 776 });
      expect(body.screenshotOptions).toMatchObject({ type: 'jpeg', quality: 92 });
      return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { headers: { 'content-type': 'image/jpeg' } });
    });
    const bytes = await renderAuditCampaignThumbnail({
      env: { DEEP_AUDIT_BROWSER_RENDER_MODE: 'auto', CLOUDFLARE_ACCOUNT_ID: 'acct', BROWSER_RENDERING_API_TOKEN: 'token' },
      html: '<p>PRIVATE AUDIT</p>', fetchImpl: fetchImpl as typeof fetch,
    });
    expect(bytes).toEqual(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
    expect(fetchImpl).toHaveBeenCalledOnce();
  });
});
