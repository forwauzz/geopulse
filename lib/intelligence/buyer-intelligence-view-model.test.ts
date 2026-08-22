import { describe, expect, it } from 'vitest';
import { assembleBuyerIntelligenceSnapshot } from './buyer-intelligence-assembler';
import { buildBuyerIntelligenceView, BUYER_INTELLIGENCE_SECTION_ORDER } from './buyer-intelligence-view-model';
import {
  BUYER_INTELLIGENCE_FIXTURE_ACCOUNT_ID as ACCOUNT_ID,
  BUYER_INTELLIGENCE_FIXTURE_CLIENT_ID as CLIENT_ID,
  buyerIntelligenceFixtureAssembly as assembly,
  buyerIntelligenceFixtureSnapshot,
} from './testing/buyer-intelligence-fixtures';

const OTHER_CLIENT_ID = '33333333-3333-4333-8333-333333333333';

function visible(view: ReturnType<typeof buildBuyerIntelligenceView>): string[] {
  return view.manifest.filter((section) => section.visible).map((section) => section.key);
}

describe('buyer intelligence view model', () => {
  it('uses one stable section manifest for every view', () => {
    for (const kind of ['prospect_preview', 'full_baseline', 'monthly_brief'] as const) {
      const view = buildBuyerIntelligenceView({ kind, snapshot: buyerIntelligenceFixtureSnapshot(), fullBaselineHref: '/full' });
      expect(view.manifest.map((section) => section.key)).toEqual(BUYER_INTELLIGENCE_SECTION_ORDER);
    }
  });

  it('limits prospect evidence, strips lineage, and gates baseline-only sections', () => {
    const view = buildBuyerIntelligenceView({
      kind: 'prospect_preview', snapshot: buyerIntelligenceFixtureSnapshot(), fullBaselineHref: '/full-baseline',
    });
    expect(view.kind).toBe('prospect_preview');
    if (view.kind !== 'prospect_preview') throw new Error('wrong_view');
    expect(view.observations.length).toBeLessThanOrEqual(3);
    expect(view.observations.every((item) => item.evidenceIds.length === 0 && item.runIds.length === 0)).toBe(true);
    expect(view.benchmark).toBeNull();
    expect(view.provenance).toBeNull();
    expect(view.cta).toEqual({ label: 'View the full baseline', href: '/full-baseline' });
    expect(visible(view)).not.toContain('provenance');
  });

  it('includes complete eligible evidence and explicit limitations in the baseline', () => {
    const snapshot = buyerIntelligenceFixtureSnapshot();
    const view = buildBuyerIntelligenceView({ kind: 'full_baseline', snapshot });
    if (view.kind !== 'full_baseline') throw new Error('wrong_view');
    expect(view.observations).toHaveLength(snapshot.observations.length);
    expect(view.observations.flatMap((item) => item.evidenceIds)).toEqual(expect.arrayContaining(snapshot.provenance.evidenceIds));
    expect(view.provenance).toEqual(snapshot.provenance);
    expect(view.limitations).toEqual(snapshot.limitations);
    expect(view.benchmark?.state).toBe('not_available');
    expect(visible(view)).toContain('benchmark');
  });

  it('keeps a first monthly brief explicitly non-comparable and names unavailable providers', () => {
    const view = buildBuyerIntelligenceView({ kind: 'monthly_brief', snapshot: buyerIntelligenceFixtureSnapshot() });
    if (view.kind !== 'monthly_brief') throw new Error('wrong_view');
    expect(view.change).toBeNull();
    expect(view.summary).toContain('initial_baseline');
    expect(view.unavailableMeasurements).toEqual(['gemini:unavailable']);
    expect(visible(view)).not.toContain('change');
  });

  it('renders only authorized agency clients and the latest snapshot per identity', () => {
    const older = buyerIntelligenceFixtureSnapshot();
    const nextInput = assembly();
    nextInput.previousSnapshot = older;
    nextInput.period = { start: older.period.end, end: '2026-08-21T00:00:00.000Z' };
    nextInput.generatedAt = '2026-08-21T12:00:00.000Z';
    const latest = assembleBuyerIntelligenceSnapshot(nextInput);
    const view = buildBuyerIntelligenceView({
      kind: 'agency_portfolio', agencyAccountId: ACCOUNT_ID,
      authorizedClientOwnerIds: [CLIENT_ID], snapshots: [older, latest],
    });
    if (view.kind !== 'agency_portfolio') throw new Error('wrong_view');
    expect(view.rows).toHaveLength(1);
    expect(view.rows[0]).toMatchObject({ ownerId: CLIENT_ID, snapshotId: latest.snapshotId, status: 'ready' });
  });

  it('fails closed on cross-client and quarantined report inputs', () => {
    const other = buyerIntelligenceFixtureSnapshot(OTHER_CLIENT_ID);
    expect(() => buildBuyerIntelligenceView({
      kind: 'agency_portfolio', agencyAccountId: ACCOUNT_ID,
      authorizedClientOwnerIds: [CLIENT_ID], snapshots: [other],
    })).toThrow('buyer_intelligence_portfolio_owner_mismatch');

    const source = buyerIntelligenceFixtureSnapshot();
    const quarantined = {
      ...source,
      reportEligibility: { state: 'quarantined' as const, reasons: ['quality_gate_failed'] },
    };
    expect(() => buildBuyerIntelligenceView({ kind: 'full_baseline', snapshot: quarantined }))
      .toThrow('buyer_intelligence_view_quarantined');
  });
});
