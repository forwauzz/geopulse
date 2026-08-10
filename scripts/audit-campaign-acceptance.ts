import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { buildTecheHealthServicesFixture } from '../workers/report/fixtures/teche-health-services';
import { buildDeepAuditPdfFromPayload } from '../workers/report/build-deep-audit-pdf';
import { buildAuditCampaignPreviewPdf, deriveAuditCampaignPreview } from '../workers/report/audit-campaign-preview';
import { issueAuditFullReportCapability, verifyAuditFullReportCapability } from '../lib/server/audit-report-capability';
import { buildAuditDelta, type AuditFindingSnapshot } from '../lib/server/audit-recurring-delta';
import { buildApolloIntakeManifest, buildAuditCampaignContracts, buildAuditDryRun } from '../lib/server/audit-campaign-readiness';
import type { PreviewContact, PreviewScanContext } from '../lib/server/email-campaign-preview';

const generatedAt = '2026-08-09T12:00:00.000Z';
const nowMs = Date.parse(generatedAt);
const outDir = resolve(process.cwd(), 'output', 'pdf', 'audit-campaign-acceptance');
const fixtureDir = resolve(process.cwd(), 'workers', 'report', 'fixtures');

function sha256(bytes: Uint8Array | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const basePayload = buildTecheHealthServicesFixture();
  // Synthetic QA expansion only: a realistic multi-page canonical payload is needed to verify
  // that a ten-page preview never promises pages the full report does not actually contain.
  const payload = {
    ...basePayload,
    pages: [
      ...basePayload.pages,
      ...Array.from({ length: 50 }, (_, index) => ({
        ...basePayload.pages[1]!,
        url: `https://techehealthservices.com/services/qa-service-${String(index + 1)}/`,
      })),
    ],
  };
  const heroImage = new Uint8Array(await readFile(resolve(fixtureDir, 'teche-homepage-hero.png')));
  const clientBranding = { siteName: 'TECHÉ Consulting', primaryHex: '#8FD299', heroImage } as const;
  const fullPdfBytes = await buildDeepAuditPdfFromPayload(payload, undefined, {
    preparedForLines: ['Tamon', 'Teché Health Services'],
    preparedByLines: ['The GEO-Pulse team', 'Montréal, Québec'],
    credibilityLines: ['Observed website signals', 'Prioritized fixes with owners', 'Fresh-scan verification'],
    heroImage,
    themePrimaryHex: clientBranding.primaryHex,
  });
  const fullPdf = await PDFDocument.load(fullPdfBytes);
  const measuredFullPages = fullPdf.getPageCount();
  assert(measuredFullPages > 10, `Canonical full report must exceed ten pages; measured ${String(measuredFullPages)}.`);
  const campaignPageCount = measuredFullPages;

  const secret = 'acceptance-only-audit-capability-secret';
  const token = issueAuditFullReportCapability({ secret, nowMs, expiresAtMs: nowMs + 30 * 86_400_000, scanId: '00000000-0000-4000-8000-000000000001', shareSlug: '1234567890abcdef1234567890abcdef', recipientEmail: 'owner@techehealthservices.com', recipientFirstName: 'Tamon', recipientCompany: 'Teché Health Services', domain: payload.domain, campaignId: 'audit-direct-business-v1' });
  const fullReportUrl = `https://getgeopulse.com/api/audit-preview/full/${token}`;
  const preview = deriveAuditCampaignPreview({ payload, recipient: { firstName: 'Tamon', company: 'Teché Health Services' }, preparedBy: 'The GEO-Pulse team — Montréal, Québec', fullReportPageCount: campaignPageCount, fullReportUrl });
  const previewPdfBytes = await buildAuditCampaignPreviewPdf(preview, clientBranding);
  const previewPdf = await PDFDocument.load(previewPdfBytes);

  const baseline: AuditFindingSnapshot[] = payload.pages.flatMap((page) => page.issuesJson.map((issue) => ({ checkId: issue.checkId ?? issue.check ?? 'unknown', url: page.url, status: (issue.status ?? (issue.passed ? 'PASS' : 'FAIL')) as AuditFindingSnapshot['status'], fix: issue.fix })));
  const monthTwo = baseline.map((item, index) => index === 1 ? { ...item, status: 'PASS' as const } : item).concat([{ checkId: 'faq', url: payload.seedUrl, status: 'FAIL' as const, fix: 'Add direct answers to the priority buyer questions.' }]);
  const delta = buildAuditDelta({ baseline, current: monthTwo, generatedAt: '2026-09-09T12:00:00.000Z' });

  const contracts = buildAuditCampaignContracts(generatedAt);
  const contact = (contactId: string, email: string, company: string): PreviewContact => ({ contactId, email, name: 'Tamon', company, companyDomain: email.split('@')[1] ?? payload.domain, personalizationReason: null, personalizationSourceUrl: null });
  const scan: PreviewScanContext = { scanId: '00000000-0000-4000-8000-000000000001', siteUrl: payload.seedUrl, score: payload.aggregateScore ?? 0, grade: payload.aggregateLetterGrade ?? '—', topIssues: payload.highlightedIssues.map((issue) => ({ check: issue.check ?? issue.checkId, fix: issue.fix })).slice(0, 2), completedAt: payload.generatedAt, passedChecks: payload.allIssues.filter((issue) => issue.passed).length, totalChecks: payload.allIssues.length, eligibleDestinations: 3, testedDestinations: 4, retrievalScore: 80, understandingTrustScore: 69, reportUrl: `https://getgeopulse.com/audit-preview/${token}`, reportThumbnailUrl: `https://getgeopulse.com/api/audit-preview/thumbnail/${token}` };
  const directContact = contact('direct-1', 'owner@techehealthservices.com', 'Teché Health Services');
  const agencyContact = contact('agency-1', 'founder@northstarit.ca', 'Northstar IT');
  const directDryRun = buildAuditDryRun({ contract: contracts.directBusiness, recipients: [directContact], scansByContactId: new Map([[directContact.contactId, scan]]), appUrl: 'https://getgeopulse.com', campaignFrozen: true, reportQaPassed: true, linksValid: true, suppressionLoaded: true });
  const agencyDryRun = buildAuditDryRun({ contract: contracts.agencyPartner, recipients: [agencyContact], scansByContactId: new Map([[agencyContact.contactId, scan]]), appUrl: 'https://getgeopulse.com', campaignFrozen: true, reportQaPassed: true, linksValid: true, suppressionLoaded: true });
  const apollo = buildApolloIntakeManifest([
    { email: 'owner@techehealthservices.com', companyDomain: 'techehealthservices.com', companyType: 'health services', title: 'Owner' },
    { email: 'founder@northstarit.ca', companyDomain: 'northstarit.ca', companyType: 'managed service provider', title: 'Founder' },
    { email: 'owner@techehealthservices.com', companyDomain: 'techehealthservices.com', companyType: 'health services', title: 'Owner' },
    { email: 'blocked@clinic.ca', companyDomain: 'clinic.ca', companyType: 'clinic', title: 'Owner' },
  ], new Set(['blocked@clinic.ca']));

  const capabilityChecks = {
    valid: verifyAuditFullReportCapability({ token, secret, nowMs, recipientEmail: directContact.email, domain: payload.domain }).ok,
    tamperedRejected: !verifyAuditFullReportCapability({ token: `${token}x`, secret, nowMs }).ok,
    expiredRejected: !verifyAuditFullReportCapability({ token, secret, nowMs: nowMs + 31 * 86_400_000 }).ok,
    wrongAudienceRejected: !verifyAuditFullReportCapability({ token, secret, nowMs, recipientEmail: agencyContact.email, domain: 'northstarit.ca' }).ok,
  };
  assert(previewPdf.getPageCount() === 10, 'Preview must contain exactly ten pages.');
  assert(preview.pages[9]?.ctaUrl === fullReportUrl, 'Page ten must contain the secure full-report CTA.');
  assert(Object.values(capabilityChecks).every(Boolean), 'Capability validation must fail closed.');
  assert(directDryRun.ready && agencyDryRun.ready, 'Both campaign lanes must pass deterministic dry run.');
  assert(directDryRun.providerCalls === 0 && agencyDryRun.providerCalls === 0, 'Acceptance must never call an email provider.');
  assert(apollo.enrollments === 0 && apollo.sends === 0, 'Apollo intake must never enroll or send.');

  const evidence = {
    contract: 'audit_campaign_acceptance_v1', generatedAt, verdict: 'campaign_ready_pending_independent_review_and_explicit_activation',
    sendsFrozen: true, providerCalls: 0, scan: { fixture: 'teche-health-services', canonicalPayloadVersion: payload.version, domain: payload.domain },
    artifacts: { fullReport: { pageCount: measuredFullPages, sha256: sha256(fullPdfBytes), path: 'full-audit.pdf' }, preview: { pageCount: previewPdf.getPageCount(), semanticRoles: preview.pages.map((page) => page.role), sha256: sha256(previewPdfBytes), path: '10-page-preview.pdf', dynamicRemainingPages: campaignPageCount - 10, clientBranding: { siteName: clientBranding.siteName, primaryHex: clientBranding.primaryHex, homepageHeroSha256: sha256(heroImage) } } },
    capabilityChecks, recurringDelta: delta, campaigns: { directBusiness: directDryRun, agencyPartner: agencyDryRun }, apolloIntake: apollo,
    activationGate: ['Independent customer-facing review accepted', 'Production secret configured', 'Live sender authentication passes', 'Fresh suppression evidence loaded', 'Founder explicitly activates the bounded cohort'],
  };
  const summary = `# GEO-Pulse audit campaign acceptance\n\nVerdict: **campaign ready pending independent review and explicit activation**\n\n- Canonical full audit: ${String(measuredFullPages)} generated pages\n- Personalized preview: 10/10 semantic pages with prospect-owned palette and homepage hero\n- Secure full-report transition: valid; tampered, expired, and wrong-audience cases rejected\n- Recurring comparison: new ${String(delta.counts.new)}, resolved ${String(delta.counts.resolved)}, regressed ${String(delta.counts.regressed)}\n- Campaign lanes: direct business + agency partner\n- Dry-run provider calls: 0\n- Apollo enrollments/sends: 0\n\nSending remains frozen until independent review and explicit activation.\n`;
  await mkdir(outDir, { recursive: true });
  await Promise.all([
    writeFile(resolve(outDir, 'full-audit.pdf'), fullPdfBytes),
    writeFile(resolve(outDir, '10-page-preview.pdf'), previewPdfBytes),
    writeFile(resolve(outDir, 'evidence.json'), `${JSON.stringify(evidence, null, 2)}\n`, 'utf8'),
    writeFile(resolve(outDir, 'README.md'), summary, 'utf8'),
  ]);
  process.stdout.write(`${summary}\nEvidence: ${resolve(outDir, 'evidence.json')}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
  process.exitCode = 1;
});
