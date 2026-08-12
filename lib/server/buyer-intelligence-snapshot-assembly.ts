import type { SupabaseClient } from '@supabase/supabase-js';
import { assembleBuyerIntelligenceSnapshot } from '../intelligence/buyer-intelligence-assembler';
import { BUYER_INTELLIGENCE_QUESTIONS } from '../intelligence/buyer-intelligence-questions';
import { projectBuyerIntelligenceEvidence } from '../intelligence/buyer-intelligence-projector';
import { QUALITY_POLICY_VERSION } from '../intelligence/quality-policy';
import { loadConfirmedOrganizationContextByHost } from './organization-measurement-context';
import { createBuyerIntelligenceSnapshotRepository } from './buyer-intelligence-snapshot-repository';

const EVALUATOR_VERSION = 'buyer-readiness-eval-v1';
const PROVIDER_QUALITY_VERSION = 'deep-audit-quality-v1';

type ScanIssue = {
  readonly checkId?: unknown;
  readonly check?: unknown;
  readonly status?: unknown;
  readonly finding?: unknown;
  readonly fix?: unknown;
  readonly confidence?: unknown;
};

type ScanRow = {
  readonly id: string;
  readonly created_at: string;
  readonly score: number | null;
  readonly issues_json: unknown;
  readonly full_results_json: unknown;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function issuesFromScan(scan: ScanRow): ScanIssue[] {
  const full = record(scan.full_results_json);
  const candidate = Array.isArray(full['issues']) ? full['issues'] : scan.issues_json;
  return Array.isArray(candidate)
    ? candidate.filter((item): item is ScanIssue => Boolean(item && typeof item === 'object'))
    : [];
}

type ProjectedStatus = 'PASS' | 'WARNING' | 'PARTIAL' | 'FAIL' | 'MISSING' | 'BLOCKED' | 'LOW_CONFIDENCE' | 'NOT_EVALUATED';

function issueStatus(value: unknown): ProjectedStatus {
  const normalized = String(value ?? '').trim().toUpperCase();
  if (['PASS', 'WARNING', 'PARTIAL', 'FAIL', 'MISSING', 'BLOCKED', 'LOW_CONFIDENCE', 'NOT_EVALUATED'].includes(normalized)) {
    return normalized as ProjectedStatus;
  }
  return 'NOT_EVALUATED';
}

function isoAfter(value: string): string {
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) throw new Error('buyer_intelligence_scan_timestamp_invalid');
  return new Date(milliseconds + 1).toISOString();
}

/** Project the latest readiness scan into the canonical, deterministic snapshot contract. */
export async function ensureAgencyClientBuyerIntelligenceSnapshot(args: {
  readonly supabase: SupabaseClient<any, 'public', any>;
  readonly agencyAccountId: string;
  readonly agencyClientId: string;
  readonly canonicalDomain: string;
}) {
  const context = await loadConfirmedOrganizationContextByHost({
    supabase: args.supabase,
    ownerType: 'agency_client',
    ownerId: args.agencyClientId,
    canonicalDomain: args.canonicalDomain,
  });
  if (!context) throw new Error('buyer_intelligence_context_unavailable');

  const { data, error } = await args.supabase.from('scans')
    .select('id,created_at,score,issues_json,full_results_json')
    .eq('agency_account_id', args.agencyAccountId)
    .eq('agency_client_id', args.agencyClientId)
    .eq('domain', args.canonicalDomain)
    .eq('status', 'complete')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  const scan = data as ScanRow | null;
  if (!scan) throw new Error('buyer_intelligence_scan_unavailable');

  const repository = createBuyerIntelligenceSnapshotRepository(args.supabase);
  const owner = { type: 'agency_client' as const, id: args.agencyClientId };
  const existing = await repository.list(owner, { limit: 24 });
  const forThisScan = existing.find((snapshot) => snapshot.provenance.runIds.includes(scan.id));
  if (forThisScan) return { snapshot: forThisScan, created: false };

  const rawIssues = issuesFromScan(scan);
  if (scan.score === null || rawIssues.length === 0) throw new Error('buyer_intelligence_scan_ineligible');
  const projectedIssues = rawIssues.flatMap((issue) => {
    const checkId = text(issue.checkId);
    if (!checkId) return [];
    const status = issueStatus(issue.status);
    return [{
      checkId,
      status,
      evidenceId: `scan:${scan.id}:check:${checkId}`,
      evidenceStatus: status === 'NOT_EVALUATED' || issue.confidence === 'low'
        ? 'unverified' as const
        : 'present' as const,
      contextVersion: context.contextVersion,
    }];
  });
  const generatedAt = isoAfter(scan.created_at);
  const projection = projectBuyerIntelligenceEvidence({
    context: { contextVersion: context.contextVersion, status: 'confirmed' },
    generatedAt,
    staleAfterHours: 24 * 31,
    audit: {
      runId: scan.id,
      contextVersion: context.contextVersion,
      qualityState: 'valid',
      collectedAt: scan.created_at,
      issues: projectedIssues,
    },
    benchmark: null,
  });
  const recommendations = BUYER_INTELLIGENCE_QUESTIONS.flatMap((question) => {
    const issue = rawIssues.find((candidate) => {
      const checkId = text(candidate.checkId);
      return Boolean(checkId && question.checks.includes(checkId)
        && ['FAIL', 'MISSING', 'WARNING', 'PARTIAL'].includes(issueStatus(candidate.status)));
    });
    if (!issue) return [];
    const checkId = text(issue.checkId)!;
    return [{
      recommendationId: `rec_${question.key}_${checkId}`,
      buyerQuestionKeys: [question.key],
      title: `Fix ${text(issue.check) ?? checkId}`,
      action: text(issue.fix) ?? text(issue.finding) ?? `Review and correct ${checkId}.`,
      ownerClass: 'development' as const,
      priority: issueStatus(issue.status) === 'FAIL' || issueStatus(issue.status) === 'MISSING'
        ? 'high' as const
        : 'medium' as const,
      effort: 'medium' as const,
      state: 'proposed' as const,
      ruleVersion: EVALUATOR_VERSION,
      kind: 'audit_check' as const,
      expectedCondition: `${checkId} passes in a later readiness scan.`,
    }];
  });
  const catalogVersion = text(record(scan.full_results_json)['checkCatalogVersion']) ?? 'readiness-checks-v1';
  const snapshot = assembleBuyerIntelligenceSnapshot({
    context,
    projection,
    period: { start: scan.created_at, end: generatedAt },
    measurement: {
      querySetId: 'buyer-readiness-checks',
      querySetVersion: catalogVersion,
      qualityPolicyVersion: QUALITY_POLICY_VERSION,
      evaluatorVersion: EVALUATOR_VERSION,
      providerQualityVersion: PROVIDER_QUALITY_VERSION,
      providers: [{ key: 'deep_audit', status: 'measured', runIds: [scan.id] }],
    },
    recommendations,
    previousSnapshot: existing[0] ?? null,
    generatedAt,
  });
  return repository.store(snapshot);
}
