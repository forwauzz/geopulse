import { PDFDocument, PDFName } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { buildTecheHealthServicesFixture } from './fixtures/teche-health-services';
import { buildAuditCampaignPreviewPdf, deriveAuditCampaignPreview, deriveAuditCampaignPreviewFromSignals } from './audit-campaign-preview';

describe('audit campaign preview', () => {
  it('derives the ten-page artifact from production scan signals', () => {
    const preview = deriveAuditCampaignPreviewFromSignals({
      signals: {
        scanId: 'scan-1', domain: 'jnmanagedservices.com', generatedAt: '2026-08-10T12:00:00.000Z',
        score: 71, grade: 'C', passedChecks: 17, totalChecks: 24,
        eligibleDestinations: 4, testedDestinations: 5, retrievalScore: 80, understandingTrustScore: 62,
        topIssues: [
          { check: 'Service proof', fix: 'Add evidence beside each service claim.' },
          { check: 'Direct answers', fix: 'Answer priority buyer questions directly.' },
        ],
      },
      recipient: { firstName: 'James', company: 'JN Managed Services' },
      preparedBy: 'The GEO-Pulse team — Montréal, Québec',
      fullReportPageCount: 30,
      fullReportUrl: 'https://getgeopulse.com/api/audit-preview/full/token',
    });
    expect(preview.pages).toHaveLength(10);
    expect(preview.pages[0]?.body.join(' ')).toContain('Prepared for James');
    expect(preview.pages[3]?.body.join(' ')).toContain('Add evidence beside each service claim');
    expect(preview.pages[9]?.ctaUrl).toContain('/audit-preview/full/');
  });

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

    const onePixelPng = Uint8Array.from(Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      'base64',
    ));
    const bytes = await buildAuditCampaignPreviewPdf(preview, {
      siteName: 'TECHÉ Consulting',
      primaryHex: '#8FD299',
      heroImage: onePixelPng,
    });
    const pdf = await PDFDocument.load(bytes);
    expect(pdf.getPageCount()).toBe(10);
    expect(pdf.getTitle()).toBe('Teché Health Services — GEO-Pulse audit preview');
    expect(pdf.getPage(0).node.Resources()?.get(PDFName.of('XObject'))).toBeDefined();
    expect(pdf.getPage(9).node.Annots()?.size()).toBe(1);
  });
});
