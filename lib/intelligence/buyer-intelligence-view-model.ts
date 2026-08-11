import { z } from 'zod';
import {
  buyerIntelligenceSnapshotSchema,
  type BuyerIntelligenceSnapshot,
} from './buyer-intelligence-contract';

export const BUYER_INTELLIGENCE_VIEW_VERSION = 'buyer-intelligence-view-v1';

export const buyerIntelligenceViewKindSchema = z.enum([
  'prospect_preview',
  'full_baseline',
  'monthly_brief',
  'agency_portfolio',
]);
export type BuyerIntelligenceViewKind = z.infer<typeof buyerIntelligenceViewKindSchema>;

export const BUYER_INTELLIGENCE_SECTION_ORDER = [
  'identity',
  'summary',
  'observations',
  'benchmark',
  'recommendations',
  'change',
  'verification',
  'unavailable_measurements',
  'provenance',
  'limitations',
  'portfolio',
  'cta',
] as const;
export type BuyerIntelligenceSectionKey = typeof BUYER_INTELLIGENCE_SECTION_ORDER[number];

export type BuyerIntelligenceSectionManifestEntry = {
  readonly key: BuyerIntelligenceSectionKey;
  readonly visible: boolean;
  readonly reason: 'included' | 'gated_by_view_policy' | 'not_applicable' | 'unavailable';
};

type ObservationView = {
  readonly id: string;
  readonly question: string;
  readonly state: BuyerIntelligenceSnapshot['observations'][number]['state'];
  readonly answer: string | null;
  readonly confidence: number | null;
  readonly evidenceIds: readonly string[];
  readonly runIds: readonly string[];
  readonly collectedAt: string;
};

type RecommendationView = {
  readonly id: string;
  readonly title: string;
  readonly action: string;
  readonly ownerClass: BuyerIntelligenceSnapshot['recommendations'][number]['ownerClass'];
  readonly priority: BuyerIntelligenceSnapshot['recommendations'][number]['priority'];
  readonly effort: BuyerIntelligenceSnapshot['recommendations'][number]['effort'];
  readonly state: BuyerIntelligenceSnapshot['recommendations'][number]['state'];
  readonly verification: BuyerIntelligenceSnapshot['recommendations'][number]['verification'];
};

export type BuyerIntelligenceReportViewModel = {
  readonly contractVersion: typeof BUYER_INTELLIGENCE_VIEW_VERSION;
  readonly kind: Exclude<BuyerIntelligenceViewKind, 'agency_portfolio'>;
  readonly snapshotId: string;
  readonly manifest: readonly BuyerIntelligenceSectionManifestEntry[];
  readonly identity: {
    readonly displayName: string;
    readonly canonicalDomain: string;
    readonly category: string;
    readonly marketLabel: string;
  };
  readonly period: BuyerIntelligenceSnapshot['period'];
  readonly headline: string;
  readonly summary: string;
  readonly observations: readonly ObservationView[];
  readonly benchmark: BuyerIntelligenceSnapshot['benchmark'] | null;
  readonly recommendations: readonly RecommendationView[];
  readonly change: BuyerIntelligenceSnapshot['change'] | null;
  readonly unavailableMeasurements: readonly string[];
  readonly provenance: BuyerIntelligenceSnapshot['provenance'] | null;
  readonly limitations: readonly string[];
  readonly cta: { readonly label: string; readonly href: string } | null;
};

export type BuyerIntelligencePortfolioViewModel = {
  readonly contractVersion: typeof BUYER_INTELLIGENCE_VIEW_VERSION;
  readonly kind: 'agency_portfolio';
  readonly agencyAccountId: string;
  readonly manifest: readonly BuyerIntelligenceSectionManifestEntry[];
  readonly headline: 'Client intelligence portfolio';
  readonly rows: readonly {
    readonly ownerId: string;
    readonly snapshotId: string;
    readonly displayName: string;
    readonly canonicalDomain: string;
    readonly periodEnd: string;
    readonly status: 'ready' | 'quarantined';
    readonly supportedQuestions: number | null;
    readonly measuredQuestions: number | null;
    readonly improvedSignals: number | null;
    readonly regressedSignals: number | null;
    readonly nextAction: string | null;
  }[];
};

export type BuyerIntelligenceViewModel = BuyerIntelligenceReportViewModel | BuyerIntelligencePortfolioViewModel;

type ReportInput = {
  readonly kind: Exclude<BuyerIntelligenceViewKind, 'agency_portfolio'>;
  readonly snapshot: BuyerIntelligenceSnapshot;
  readonly fullBaselineHref?: string;
};

type PortfolioInput = {
  readonly kind: 'agency_portfolio';
  readonly agencyAccountId: string;
  readonly authorizedClientOwnerIds: readonly string[];
  readonly snapshots: readonly BuyerIntelligenceSnapshot[];
};

function manifest(kind: BuyerIntelligenceViewKind, available: ReadonlySet<BuyerIntelligenceSectionKey>) {
  const allowed: Record<BuyerIntelligenceViewKind, ReadonlySet<BuyerIntelligenceSectionKey>> = {
    prospect_preview: new Set(['identity', 'summary', 'observations', 'recommendations', 'limitations', 'cta']),
    full_baseline: new Set(['identity', 'summary', 'observations', 'benchmark', 'recommendations', 'provenance', 'limitations']),
    monthly_brief: new Set(['identity', 'summary', 'change', 'verification', 'unavailable_measurements', 'limitations']),
    agency_portfolio: new Set(['portfolio']),
  };
  return BUYER_INTELLIGENCE_SECTION_ORDER.map((key) => ({
    key,
    visible: allowed[kind].has(key) && available.has(key),
    reason: !allowed[kind].has(key)
      ? 'gated_by_view_policy' as const
      : available.has(key)
        ? 'included' as const
        : (key === 'change' || key === 'verification' ? 'not_applicable' as const : 'unavailable' as const),
  }));
}

function marketLabel(snapshot: BuyerIntelligenceSnapshot): string {
  return [snapshot.organization.market.locality, snapshot.organization.market.subdivisionCode, snapshot.organization.market.countryCode]
    .filter((value): value is string => Boolean(value))
    .join(', ');
}

function observationView(item: BuyerIntelligenceSnapshot['observations'][number], includeLineage: boolean): ObservationView {
  return {
    id: item.observationId,
    question: item.buyerQuestion,
    state: item.state,
    answer: item.answerSummary,
    confidence: item.confidence,
    evidenceIds: includeLineage ? item.evidenceIds : [],
    runIds: includeLineage ? item.runIds : [],
    collectedAt: item.collectedAt,
  };
}

function recommendationView(item: BuyerIntelligenceSnapshot['recommendations'][number]): RecommendationView {
  return {
    id: item.recommendationId,
    title: item.title,
    action: item.action,
    ownerClass: item.ownerClass,
    priority: item.priority,
    effort: item.effort,
    state: item.state,
    verification: item.verification,
  };
}

function reportView(input: ReportInput): BuyerIntelligenceReportViewModel {
  const snapshot = buyerIntelligenceSnapshotSchema.parse(input.snapshot);
  if (snapshot.reportEligibility.state !== 'eligible') {
    throw new Error(`buyer_intelligence_view_quarantined:${snapshot.snapshotId}`);
  }
  const supported = snapshot.observations.filter((item) => item.state === 'supported').length;
  const unavailableMeasurements = snapshot.measurement.providers
    .filter((provider) => provider.status !== 'measured')
    .map((provider) => `${provider.key}:${provider.status}`);
  const available = new Set<BuyerIntelligenceSectionKey>(['identity', 'summary', 'limitations']);
  if (snapshot.observations.length) available.add('observations');
  if (snapshot.recommendations.length) available.add('recommendations');
  // A full baseline must disclose an unavailable cohort instead of silently hiding it.
  if (input.kind === 'full_baseline' || snapshot.benchmark.state === 'eligible') available.add('benchmark');
  if (snapshot.provenance.evidenceIds.length && snapshot.provenance.runIds.length) available.add('provenance');
  if (snapshot.change.comparable) available.add('change');
  if (snapshot.recommendations.some((item) => item.verification.result !== 'pending')) available.add('verification');
  if (unavailableMeasurements.length) available.add('unavailable_measurements');
  if (input.kind === 'prospect_preview' && input.fullBaselineHref) available.add('cta');

  if (input.kind === 'prospect_preview') {
    return {
      contractVersion: BUYER_INTELLIGENCE_VIEW_VERSION,
      kind: input.kind,
      snapshotId: snapshot.snapshotId,
      manifest: manifest(input.kind, available),
      identity: {
        displayName: snapshot.organization.displayName,
        canonicalDomain: snapshot.organization.canonicalDomain,
        category: snapshot.organization.category,
        marketLabel: marketLabel(snapshot),
      },
      period: snapshot.period,
      headline: `${snapshot.organization.displayName}: what AI buyers can verify today`,
      summary: `${String(supported)} of ${String(snapshot.observations.length)} measured buyer questions were fully supported in this audit period.`,
      observations: snapshot.observations.slice(0, 3).map((item) => observationView(item, false)),
      benchmark: null,
      recommendations: snapshot.recommendations.slice(0, 3).map(recommendationView),
      change: null,
      unavailableMeasurements: [],
      provenance: null,
      limitations: snapshot.limitations,
      cta: input.fullBaselineHref ? { label: 'View the full baseline', href: input.fullBaselineHref } : null,
    };
  }

  if (input.kind === 'monthly_brief') {
    const verified = snapshot.recommendations.filter((item) => item.verification.result !== 'pending');
    return {
      contractVersion: BUYER_INTELLIGENCE_VIEW_VERSION,
      kind: input.kind,
      snapshotId: snapshot.snapshotId,
      manifest: manifest(input.kind, available),
      identity: {
        displayName: snapshot.organization.displayName,
        canonicalDomain: snapshot.organization.canonicalDomain,
        category: snapshot.organization.category,
        marketLabel: marketLabel(snapshot),
      },
      period: snapshot.period,
      headline: `${snapshot.organization.displayName}: monthly verification brief`,
      summary: snapshot.change.comparable
        ? `${String(snapshot.change.changes.filter((item) => item.direction === 'improved').length)} measured signals improved and ${String(snapshot.change.changes.filter((item) => item.direction === 'regressed').length)} regressed.`
        : `A like-for-like comparison is unavailable: ${snapshot.change.reasons.join(', ')}.`,
      observations: [],
      benchmark: null,
      recommendations: verified.map(recommendationView),
      change: snapshot.change.comparable ? snapshot.change : null,
      unavailableMeasurements,
      provenance: null,
      limitations: snapshot.limitations,
      cta: null,
    };
  }

  return {
    contractVersion: BUYER_INTELLIGENCE_VIEW_VERSION,
    kind: input.kind,
    snapshotId: snapshot.snapshotId,
    manifest: manifest(input.kind, available),
    identity: {
      displayName: snapshot.organization.displayName,
      canonicalDomain: snapshot.organization.canonicalDomain,
      category: snapshot.organization.category,
      marketLabel: marketLabel(snapshot),
    },
    period: snapshot.period,
    headline: `${snapshot.organization.displayName}: buyer intelligence baseline`,
    summary: `${String(supported)} of ${String(snapshot.observations.length)} measured buyer questions were fully supported in this audit period.`,
    observations: snapshot.observations.map((item) => observationView(item, true)),
    benchmark: snapshot.benchmark,
    recommendations: snapshot.recommendations.map(recommendationView),
    change: null,
    unavailableMeasurements: [],
    provenance: snapshot.provenance,
    limitations: snapshot.limitations,
    cta: null,
  };
}

function portfolioView(input: PortfolioInput): BuyerIntelligencePortfolioViewModel {
  z.string().uuid().parse(input.agencyAccountId);
  const authorized = new Set(input.authorizedClientOwnerIds.map((id) => z.string().uuid().parse(id)));
  const latest = new Map<string, BuyerIntelligenceSnapshot>();
  for (const candidate of input.snapshots) {
    const snapshot = buyerIntelligenceSnapshotSchema.parse(candidate);
    if (snapshot.owner.type !== 'agency_client' || !snapshot.owner.id || !authorized.has(snapshot.owner.id)) {
      throw new Error(`buyer_intelligence_portfolio_owner_mismatch:${snapshot.snapshotId}`);
    }
    const current = latest.get(snapshot.organization.identityId);
    if (!current || Date.parse(snapshot.period.end) > Date.parse(current.period.end)) {
      latest.set(snapshot.organization.identityId, snapshot);
    }
  }
  const available = new Set<BuyerIntelligenceSectionKey>(['portfolio']);
  const rows = [...latest.values()].map((snapshot) => {
    const eligible = snapshot.reportEligibility.state === 'eligible';
    return {
      ownerId: snapshot.owner.id!,
      snapshotId: snapshot.snapshotId,
      displayName: snapshot.organization.displayName,
      canonicalDomain: snapshot.organization.canonicalDomain,
      periodEnd: snapshot.period.end,
      status: eligible ? 'ready' as const : 'quarantined' as const,
      supportedQuestions: eligible ? snapshot.observations.filter((item) => item.state === 'supported').length : null,
      measuredQuestions: eligible ? snapshot.observations.filter((item) => item.state !== 'not_available').length : null,
      improvedSignals: eligible && snapshot.change.comparable ? snapshot.change.changes.filter((item) => item.direction === 'improved').length : null,
      regressedSignals: eligible && snapshot.change.comparable ? snapshot.change.changes.filter((item) => item.direction === 'regressed').length : null,
      nextAction: eligible ? snapshot.recommendations.find((item) => item.state !== 'dismissed')?.action ?? null : null,
    };
  }).sort((left, right) => left.displayName.localeCompare(right.displayName));
  return {
    contractVersion: BUYER_INTELLIGENCE_VIEW_VERSION,
    kind: input.kind,
    agencyAccountId: input.agencyAccountId,
    manifest: manifest(input.kind, available),
    headline: 'Client intelligence portfolio',
    rows,
  };
}

export function buildBuyerIntelligenceView(input: ReportInput | PortfolioInput): BuyerIntelligenceViewModel {
  return input.kind === 'agency_portfolio' ? portfolioView(input) : reportView(input);
}
