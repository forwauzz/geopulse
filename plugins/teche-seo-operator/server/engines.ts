// Narrow reuse surface. No app entrypoint, DB coordinator, queue or environment loader.
export { auditPageFromHtml } from '../../../workers/scan-engine/run-scan';
export { fetchPage } from '../../../workers/scan-engine/fetch-page';
export { fetchGateText } from '../../../workers/lib/fetch-gate';
export { validateUrl } from '../../../workers/lib/ssrf';
export { extractSameOriginLinks, prioritizeUrlsBySection } from '../../../workers/scan-engine/crawl-url-utils';
export { buildDeepAuditReportPayload } from '../../../workers/report/deep-audit-report-payload';
export { buildDeepAuditPdfFromPayload } from '../../../workers/report/build-deep-audit-pdf';
export { buildDeepAuditMarkdown } from '../../../workers/report/build-deep-audit-markdown';
export { resolveReportContradictions, runReportQaGate } from '../../../workers/report/report-qa-gate';
export { letterGrade, computeScore } from '../../../workers/scan-engine/scoring';
export { fetchSearchConsoleRows } from '../../../lib/server/seo-providers';
export { classifySearchConsoleOpportunity, aggregateSearchConsoleRows } from '../../../lib/server/seo-opportunities';
export { OpenAiCompatibleBenchmarkExecutionAdapter } from '../../../lib/server/benchmark-execution';
