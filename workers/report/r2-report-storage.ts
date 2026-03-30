/**
 * R2 storage for deep-audit PDF + Markdown (DA-003). Optional binding `REPORT_FILES`.
 */

export type UploadedReportKeys = {
  readonly pdfKey: string;
  readonly markdownKey: string;
};

export type UploadedRewriteKey = {
  readonly rewrittenMarkdownKey: string;
};

export function publicObjectUrl(publicBase: string, key: string): string {
  const base = publicBase.replace(/\/$/, '');
  const path = key.startsWith('/') ? key : `/${key}`;
  return `${base}${path}`;
}

/**
 * Upload PDF + Markdown under `deep-audits/{scanId}/`.
 */
export async function uploadDeepAuditReportFiles(
  bucket: R2Bucket,
  scanId: string,
  pdfBytes: Uint8Array,
  markdownUtf8: string
): Promise<UploadedReportKeys> {
  const prefix = `deep-audits/${scanId}`;
  const pdfKey = `${prefix}/report.pdf`;
  const mdKey = `${prefix}/report.md`;

  await bucket.put(pdfKey, pdfBytes, {
    httpMetadata: { contentType: 'application/pdf', cacheControl: 'private, max-age=3600' },
  });

  await bucket.put(mdKey, markdownUtf8, {
    httpMetadata: { contentType: 'text/markdown; charset=utf-8', cacheControl: 'private, max-age=3600' },
  });

  return { pdfKey, markdownKey: mdKey };
}

export async function uploadDeepAuditRewrittenMarkdown(
  bucket: R2Bucket,
  scanId: string,
  markdownUtf8: string
): Promise<UploadedRewriteKey> {
  const rewrittenMarkdownKey = `deep-audits/${scanId}/report.rewritten.md`;

  await bucket.put(rewrittenMarkdownKey, markdownUtf8, {
    httpMetadata: { contentType: 'text/markdown; charset=utf-8', cacheControl: 'private, max-age=3600' },
  });

  return { rewrittenMarkdownKey };
}
