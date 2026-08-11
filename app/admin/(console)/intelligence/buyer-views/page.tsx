import { BuyerIntelligenceAgencyReportView } from '@/components/agency-report-view';
import { assembleBuyerIntelligenceSnapshot } from '@/lib/intelligence/buyer-intelligence-assembler';
import { buildBuyerIntelligenceView } from '@/lib/intelligence/buyer-intelligence-view-model';
import {
  BUYER_INTELLIGENCE_FIXTURE_ACCOUNT_ID,
  BUYER_INTELLIGENCE_FIXTURE_CLIENT_ID,
  buyerIntelligenceFixtureAssembly,
  buyerIntelligenceFixtureSnapshot,
} from '@/lib/intelligence/testing/buyer-intelligence-fixtures';

export const dynamic = 'force-dynamic';

function previewModels() {
  const baseline = buyerIntelligenceFixtureSnapshot();
  const monthlyInput = buyerIntelligenceFixtureAssembly();
  monthlyInput.previousSnapshot = baseline;
  monthlyInput.period = { start: baseline.period.end, end: '2026-08-21T00:00:00.000Z' };
  monthlyInput.generatedAt = '2026-08-21T12:00:00.000Z';
  const monthly = assembleBuyerIntelligenceSnapshot(monthlyInput);
  return [
    buildBuyerIntelligenceView({ kind: 'prospect_preview', snapshot: baseline, fullBaselineHref: '#full-baseline' }),
    buildBuyerIntelligenceView({ kind: 'full_baseline', snapshot: baseline }),
    buildBuyerIntelligenceView({ kind: 'monthly_brief', snapshot: monthly }),
    buildBuyerIntelligenceView({
      kind: 'agency_portfolio', agencyAccountId: BUYER_INTELLIGENCE_FIXTURE_ACCOUNT_ID,
      authorizedClientOwnerIds: [BUYER_INTELLIGENCE_FIXTURE_CLIENT_ID], snapshots: [baseline, monthly],
    }),
  ] as const;
}

export default function BuyerIntelligenceViewsPreviewPage() {
  const branding = {
    publisherName: 'GEO-Pulse',
    preparedBy: 'The GEO-Pulse team, Montreal, Quebec',
    accentColor: '#0e7490',
    heroImageUrl: '/internal/buyer-intelligence-northstar-hero.svg',
    footerNote: 'Prepared for Northstar Technology Services by the GEO-Pulse team, Montreal, Quebec.',
  } as const;
  return (
    <div className="space-y-12 pb-24">
      <header className="rounded-3xl bg-[#111827] px-6 py-8 text-white md:px-10">
        <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[#93a4c4]">Internal preview · synthetic MSP fixture</p>
        <h1 className="mt-3 font-headline text-3xl font-semibold tracking-tight">Buyer-intelligence product views</h1>
        <p className="mt-3 max-w-3xl text-sm leading-relaxed text-white/65">All four previews below derive from the same canonical snapshot contract and section manifest. No customer data or external delivery is used.</p>
      </header>
      {previewModels().map((model) => (
        <div id={model.kind === 'full_baseline' ? 'full-baseline' : model.kind} key={model.kind} className="scroll-mt-8">
          <BuyerIntelligenceAgencyReportView model={model} branding={branding} />
        </div>
      ))}
    </div>
  );
}
