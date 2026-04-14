export type DeepAuditDownloadLinks = {
  readonly pdfUrl: string;
  readonly markdownUrl?: string;
};

export type EmailIssueRow = {
  readonly check: string;
  readonly fix?: string;
  readonly weight?: number;
};

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function uint8ToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

export function severityLabel(weight: number | undefined): string {
  if (!weight) return 'Low';
  if (weight >= 8) return 'High';
  if (weight >= 5) return 'Medium';
  return 'Low';
}

export function severityColor(sev: string): string {
  if (sev === 'High') return '#9E4040';
  if (sev === 'Medium') return '#997326';
  return '#565E74';
}

export function gradeColor(grade: string): string {
  if (grade === 'A' || grade === 'A+') return '#268055';
  if (grade === 'B' || grade === 'B+') return '#3B7A57';
  if (grade === 'C') return '#997326';
  return '#9E4040';
}

export function buildDeliveryCallToAction(input: {
  attachPdf: boolean;
  downloadLinks?: DeepAuditDownloadLinks;
  scanId?: string;
  appUrl?: string;
}): {
  ctaHref: string | null;
  ctaLabel: string;
  attachNote: string;
} {
  const resultsPageUrl =
    input.appUrl && input.scanId
      ? `${input.appUrl.replace(/\/$/, '')}/results/${input.scanId}`
      : null;

  if (input.attachPdf) {
    return {
      ctaHref: resultsPageUrl,
      ctaLabel: resultsPageUrl ? 'View your results online' : 'View full report',
      attachNote:
        '<p style="color:#586162;font-size:13px;text-align:center;margin-top:12px;">Your full report is attached to this email. Sign in later with the same checkout email if you want this report saved in your dashboard.</p>',
    };
  }

  if (input.downloadLinks?.pdfUrl) {
    return {
      ctaHref: input.downloadLinks.pdfUrl,
      ctaLabel: 'Download full report',
      attachNote:
        '<p style="color:#586162;font-size:13px;text-align:center;margin-top:12px;">Your report is available via the link above. Sign in later with the same checkout email if you want this report saved in your dashboard.</p>',
    };
  }

  return {
    ctaHref: null,
    ctaLabel: 'View full report',
    attachNote: '',
  };
}
