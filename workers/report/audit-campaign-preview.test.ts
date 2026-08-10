import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildTecheHealthServicesFixture } from './fixtures/teche-health-services';
import { buildAuditCampaignPreviewPdf, deriveAuditCampaignPreview } from './audit-campaign-preview';

describe('audit campaign preview', () => {
  it('derives exactly ten stable, personalized pages from the canonical audit', async () => {
    const payload = buildTecheHealthServicesFixture();
    const preview = deriveAuditCampaignPreview({
      payload,
      recipient: { firstName: 'Tamon', company: 'Teché Health Services' },
      preparedBy: 'The GEO-Pulse team — Montréal, Québec',
      fullReportPageCount: 30,
      fullReportUrl: 'https://getgeopulse.com/api/audit-preview/full/signed-token',
    });

    expect(preview.pages).toHaveLength(10);
    expect(preview.pages.map((page) => page.role)).toEqual([
      'cover', 'owner_summary', 'scorecard', 'priority_fixes', 'buyer_questions',
      'page_patterns', 'delegation', 'technical_access', 'monthly_monitoring', 'full_report_cta',
    ]);
    expect(preview.pages[0]?.body.join(' ')).toContain('Prepared for Tamon');
    expect(preview.pages[9]?.body.join(' ')).toContain('20 pages left');
    expect(preview.pages[9]?.ctaUrl).toBe('https://getgeopulse.com/api/audit-preview/full/signed-token');

    const bytes = await buildAuditCampaignPreviewPdf(preview);
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(10);
    expect(pdf.getPage(9).node.Annots()?.size()).toBe(1);
  });
});
