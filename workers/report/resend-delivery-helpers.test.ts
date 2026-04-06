import { describe, expect, it } from 'vitest';
import {
  buildDeliveryCallToAction,
  escapeHtml,
  gradeColor,
  severityColor,
  severityLabel,
  uint8ToBase64,
} from './resend-delivery-helpers';

describe('resend-delivery-helpers', () => {
  it('builds the attached-pdf CTA using the results page when available', () => {
    expect(
      buildDeliveryCallToAction({
        attachPdf: true,
        scanId: 'scan-123',
        appUrl: 'https://app.example.com/',
      })
    ).toEqual({
      ctaHref: 'https://app.example.com/results/scan-123',
      ctaLabel: 'View your results online',
      attachNote:
        '<p style="color:#586162;font-size:13px;text-align:center;margin-top:12px;">Your full report is attached to this email. Sign in later with the same checkout email if you want this report saved in your dashboard.</p>',
    });
  });

  it('builds the download CTA when the PDF is link-delivered', () => {
    expect(
      buildDeliveryCallToAction({
        attachPdf: false,
        downloadLinks: { pdfUrl: 'https://files.example.com/report.pdf' },
      })
    ).toEqual({
      ctaHref: 'https://files.example.com/report.pdf',
      ctaLabel: 'Download full report',
      attachNote:
        '<p style="color:#586162;font-size:13px;text-align:center;margin-top:12px;">Your report is available via the link above. Sign in later with the same checkout email if you want this report saved in your dashboard.</p>',
    });
  });

  it('keeps the small formatting helpers stable', () => {
    expect(escapeHtml('<test&"quote">')).toBe('&lt;test&amp;&quot;quote&quot;&gt;');
    expect(severityLabel(8)).toBe('High');
    expect(severityColor('Medium')).toBe('#997326');
    expect(gradeColor('A')).toBe('#268055');
    expect(uint8ToBase64(new Uint8Array([72, 73]))).toBe('SEk=');
  });
});
