import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { assembleBuyerIntelligenceSnapshot } from '../intelligence/buyer-intelligence-assembler';
import { buildBuyerIntelligenceView } from '../intelligence/buyer-intelligence-view-model';
import {
  BUYER_INTELLIGENCE_FIXTURE_ACCOUNT_ID,
  BUYER_INTELLIGENCE_FIXTURE_CLIENT_ID,
  buyerIntelligenceFixtureAssembly,
  buyerIntelligenceFixtureSnapshot,
} from '../intelligence/testing/buyer-intelligence-fixtures';
import { buildBuyerIntelligenceAgencyReportPdf } from './agency-report-pdf';

const htmlRendererSource = readFileSync(join(process.cwd(), 'components/agency-report-view.tsx'), 'utf8');

function monthlySnapshot() {
  const prior = buyerIntelligenceFixtureSnapshot();
  const input = buyerIntelligenceFixtureAssembly();
  input.previousSnapshot = prior;
  input.period = { start: prior.period.end, end: '2026-08-21T00:00:00.000Z' };
  input.generatedAt = '2026-08-21T12:00:00.000Z';
  return assembleBuyerIntelligenceSnapshot(input);
}

describe('canonical buyer intelligence renderers', () => {
  it('extends the existing HTML renderer with the shared manifest and gated sections', () => {
    const snapshot = buyerIntelligenceFixtureSnapshot();
    const preview = buildBuyerIntelligenceView({ kind: 'prospect_preview', snapshot, fullBaselineHref: '/full' });
    const baseline = buildBuyerIntelligenceView({ kind: 'full_baseline', snapshot });
    expect(preview.kind).toBe('prospect_preview');
    expect(baseline.kind).toBe('full_baseline');
    expect(htmlRendererSource).toContain("viewHas(model, 'provenance') && model.provenance");
    expect(htmlRendererSource).toContain("viewHas(model, 'cta') && model.cta");
    expect(htmlRendererSource).toContain('data-view-kind={model.kind}');
    expect(htmlRendererSource).toContain('data-client-hero-proof');
    expect(htmlRendererSource).toContain('Prepared by {branding.preparedBy}');
    expect(htmlRendererSource).toContain('No eligible comparison cohort was attached');
    expect(htmlRendererSource).toContain('BuyerIntelligenceAgencyReportView');
  });

  it('renders monthly unavailable measurements and a tenant-safe portfolio', () => {
    const monthly = buildBuyerIntelligenceView({ kind: 'monthly_brief', snapshot: monthlySnapshot() });
    const portfolio = buildBuyerIntelligenceView({
      kind: 'agency_portfolio', agencyAccountId: BUYER_INTELLIGENCE_FIXTURE_ACCOUNT_ID,
      authorizedClientOwnerIds: [BUYER_INTELLIGENCE_FIXTURE_CLIENT_ID],
      snapshots: [buyerIntelligenceFixtureSnapshot()],
    });
    expect(monthly.kind).toBe('monthly_brief');
    expect(portfolio.kind).toBe('agency_portfolio');
    expect(htmlRendererSource).toContain('Measurements not available this period');
    expect(htmlRendererSource).toContain('Held from client reporting until the evidence gate passes.');
    expect(htmlRendererSource).toContain('row.canonicalDomain');
  });

  it('renders valid multi-page PDFs for all four views from the shared manifest', async () => {
    const snapshot = buyerIntelligenceFixtureSnapshot();
    const views = [
      buildBuyerIntelligenceView({ kind: 'prospect_preview', snapshot, fullBaselineHref: '/full' }),
      buildBuyerIntelligenceView({ kind: 'full_baseline', snapshot }),
      buildBuyerIntelligenceView({ kind: 'monthly_brief', snapshot: monthlySnapshot() }),
      buildBuyerIntelligenceView({
        kind: 'agency_portfolio', agencyAccountId: BUYER_INTELLIGENCE_FIXTURE_ACCOUNT_ID,
        authorizedClientOwnerIds: [BUYER_INTELLIGENCE_FIXTURE_CLIENT_ID], snapshots: [snapshot],
      }),
    ];
    for (const view of views) {
      const bytes = await buildBuyerIntelligenceAgencyReportPdf(view);
      const document = await PDFDocument.load(bytes);
      expect(document.getPageCount()).toBeGreaterThan(0);
      expect(document.getTitle()).toBe(view.headline);
    }
  });
});
