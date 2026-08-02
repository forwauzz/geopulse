import 'server-only';

import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  ORGANIZATION_CAPABILITY_CONTRACT_VERSION,
  organizationCapabilityAccessSchema,
  organizationCapabilityRequestSchema,
  type OrganizationCapabilityAccess,
  type OrganizationCapabilityAuditEvent,
  type OrganizationCapabilityFailure,
  type OrganizationCapabilityRequest,
  type OrganizationMarketContract,
} from '../intelligence/organization-context-capabilities';
import type { OrganizationContext } from '../intelligence/organization-context';
import type { ExactDomainResolution } from '../intelligence/organization-resolver';
import { retrieveIntelligenceEvidence } from '../intelligence/evidence-retrieval';
import { buildAgencyReportPdf } from './agency-report-pdf';
import { loadLatestAgencyReport } from './load-agency-report-snapshot';
import { createOrganizationContextRepository } from './organization-context-repository';
import { resolveOrganizationWebsite } from './organization-resolver';
import { loadReportPreviewPayload, type ReportPreviewPayload } from './report-preview-payload';

type SupabaseLike = SupabaseClient<any, 'public', any>;

type CapabilityReady<T> = {
  readonly contractVersion: typeof ORGANIZATION_CAPABILITY_CONTRACT_VERSION;
  readonly status: 'ready';
  readonly value: T;
  /** Generation and preview never confer a separate external-delivery authorization. */
  readonly externalDeliveryAuthorized: false;
};

export type SanitizedEvidence = {
  readonly evidenceId: string;
  readonly sourceKind: string;
  readonly observedAt: string | null;
  readonly excerpt: string | null;
  readonly sourceUrl: string | null;
  readonly qualityState: 'valid' | 'valid_partial';
};

export type MeasurementExplanation = {
  readonly claim: 'observed_visibility' | 'provider_availability' | 'leading_opportunity';
  readonly finding: string;
  readonly measuredDomain: string;
  readonly measurementWindow: string;
  readonly contextVersion: string;
  readonly evidence: {
    readonly evaluationsTracked: number;
    readonly evaluationsCited: number;
    readonly availableProviders: readonly string[];
    readonly unavailableProviders: readonly string[];
  };
  readonly limitations: readonly string[];
};

export type GeneratedArtifactDraft = {
  readonly artifactKind: 'agency_visibility_report';
  readonly contentType: 'application/pdf';
  readonly fileName: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly bytes: Uint8Array;
  readonly persisted: false;
  readonly shared: false;
  readonly delivered: false;
};

export type OrganizationCapabilityResult =
  | CapabilityReady<{ readonly detection: ExactDomainResolution }>
  | CapabilityReady<{ readonly context: OrganizationContext }>
  | CapabilityReady<{ readonly markets: readonly OrganizationMarketContract[] }>
  | CapabilityReady<{ readonly evidence: readonly SanitizedEvidence[]; readonly limitations: readonly string[] }>
  | CapabilityReady<{ readonly explanation: MeasurementExplanation }>
  | CapabilityReady<{ readonly artifact: GeneratedArtifactDraft }>
  | CapabilityReady<{ readonly preview: ReportPreviewPayload }>
  | OrganizationCapabilityFailure;

export type OrganizationCapabilityRuntime = {
  readonly supabase: SupabaseLike;
  readonly onAudit?: (event: OrganizationCapabilityAuditEvent) => void | Promise<void>;
  readonly resolveWebsite?: typeof resolveOrganizationWebsite;
  readonly buildPdf?: typeof buildAgencyReportPdf;
};

function failure(
  status: OrganizationCapabilityFailure['status'],
  error: OrganizationCapabilityFailure['error'],
  message: string,
  retryable = false,
): OrganizationCapabilityFailure {
  return {
    contractVersion: ORGANIZATION_CAPABILITY_CONTRACT_VERSION,
    status,
    error,
    message,
    retryable,
    externalDeliveryAuthorized: false,
  };
}

function ready<T>(value: T): CapabilityReady<T> {
  return {
    contractVersion: ORGANIZATION_CAPABILITY_CONTRACT_VERSION,
    status: 'ready',
    value,
    externalDeliveryAuthorized: false,
  };
}

function exactScope(access: OrganizationCapabilityAccess, request: OrganizationCapabilityRequest): boolean {
  if (access.isPlatformAdmin) return true;
  return access.scopes.some((scope) =>
    scope.type === request.target.type && scope.id === request.target.id
  );
}

function capabilityPermission(
  access: OrganizationCapabilityAccess,
  capability: OrganizationCapabilityRequest['capability'],
): boolean {
  if (capability === 'generate_artifact') return access.permissions.generateArtifact;
  if (capability === 'preview_artifact') return access.permissions.previewArtifact;
  return access.permissions.read;
}

function marketContract(context: OrganizationContext): OrganizationMarketContract {
  return {
    contextId: context.contextId,
    contextVersion: context.contextVersion,
    organizationIdentityId: context.organization.identityId,
    canonicalDomain: context.organization.canonicalDomain,
    ...context.market,
  };
}

function safeFileName(value: string): string {
  const stem = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${stem || 'organization'}-ai-visibility-report.pdf`;
}

function measurementExplanation(
  claim: MeasurementExplanation['claim'],
  report: NonNullable<Awaited<ReturnType<typeof loadLatestAgencyReport>>>,
): MeasurementExplanation {
  const { snapshot } = report;
  const base = {
    claim,
    measuredDomain: snapshot.domain,
    measurementWindow: snapshot.windowDate,
    contextVersion: snapshot.integrity.contextVersion,
    evidence: {
      evaluationsTracked: snapshot.evaluationsTracked,
      evaluationsCited: snapshot.evaluationsCited,
      availableProviders: snapshot.engines.map((engine) => engine.label),
      unavailableProviders: [...snapshot.unavailableEngines],
    },
  };
  if (claim === 'observed_visibility') {
    return {
      ...base,
      finding: `${snapshot.evaluationsCited} of ${snapshot.evaluationsTracked} compatible measured answers cited the organization.`,
      limitations: ['This is an observed measurement, not a causal claim or a forecast.'],
    };
  }
  if (claim === 'provider_availability') {
    return {
      ...base,
      finding: snapshot.unavailableEngines.length === 0
        ? 'Every configured provider included in this artifact passed the measurement quality gate.'
        : `${snapshot.unavailableEngines.length} configured provider(s) were unavailable and were not scored as zero.`,
      limitations: ['Provider availability applies only to this measurement window.'],
    };
  }
  const opportunity = snapshot.opportunities[0];
  return {
    ...base,
    finding: opportunity
      ? `The leading measured opportunity was: ${opportunity.queryText}`
      : 'No uncited buyer question was available for a supported leading-opportunity claim.',
    limitations: opportunity
      ? ['This prioritizes the current measured question set; it does not prove future performance.']
      : ['Insufficient evidence for a leading-opportunity claim.'],
  };
}

async function audit(
  runtime: OrganizationCapabilityRuntime,
  request: OrganizationCapabilityRequest,
  outcome: OrganizationCapabilityAuditEvent['outcome'],
): Promise<void> {
  await runtime.onAudit?.({
    contractVersion: ORGANIZATION_CAPABILITY_CONTRACT_VERSION,
    requestId: request.audit.requestId,
    actorId: request.audit.actorId,
    capability: request.capability,
    targetType: request.target.type,
    targetId: request.target.id,
    outcome,
    occurredAt: new Date().toISOString(),
  });
}

/**
 * Internal adapter boundary. Authentication remains outside this function: callers resolve access
 * from server-side membership data, while this executor enforces the exact target and operation.
 */
export async function executeOrganizationCapability(args: {
  readonly runtime: OrganizationCapabilityRuntime;
  readonly access: unknown;
  readonly request: unknown;
}): Promise<OrganizationCapabilityResult> {
  const access = organizationCapabilityAccessSchema.safeParse(args.access);
  const request = organizationCapabilityRequestSchema.safeParse(args.request);
  if (!access.success || !request.success) {
    return failure('invalid', 'invalid_request', 'The capability request or access context is invalid.');
  }
  if (access.data.actorId !== request.data.audit.actorId) {
    await audit(args.runtime, request.data, 'denied');
    return failure('denied', 'actor_mismatch', 'The authenticated actor does not match the audit context.');
  }
  if (!exactScope(access.data, request.data)) {
    await audit(args.runtime, request.data, 'denied');
    return failure('denied', 'tenant_scope_violation', 'The actor does not have this exact tenant scope.');
  }
  if (!capabilityPermission(access.data, request.data.capability)) {
    await audit(args.runtime, request.data, 'denied');
    return failure('denied', 'permission_denied', 'The requested operation is not permitted.');
  }

  try {
    const command = request.data;
    let result: OrganizationCapabilityResult;
    if (command.capability === 'detect_context') {
      const detection = await (args.runtime.resolveWebsite ?? resolveOrganizationWebsite)({
        url: command.url,
        approvedAliasHosts: command.approvedAliasHosts,
      });
      result = detection.ok
        ? ready({ detection: detection.resolution })
        : failure('insufficient_evidence', 'context_unavailable', detection.reason, true);
    } else if (command.capability === 'read_context' || command.capability === 'list_markets') {
      const lookup = await createOrganizationContextRepository(args.runtime.supabase).getByOwnerAndDomain({
        ownerType: command.target.type,
        ownerId: command.target.id,
        domainId: command.domainId,
        isPlatformAdmin: access.data.isPlatformAdmin,
      });
      if (lookup.status !== 'ready') {
        result = failure(
          lookup.status === 'unauthorized' ? 'denied' : 'insufficient_evidence',
          lookup.status === 'unauthorized' ? 'tenant_scope_violation' : 'context_unavailable',
          `Organization Context is unavailable: ${lookup.reason}.`,
        );
      } else {
        result = command.capability === 'read_context'
          ? ready({ context: lookup.context })
          : ready({ markets: [marketContract(lookup.context)] });
      }
    } else if (command.capability === 'retrieve_evidence') {
      const tenantScope = command.target.type === 'internal_benchmark'
        ? { platformInternal: true as const }
        : {
            platformInternal: false as const,
            tenantType: command.target.type,
            tenantId: command.target.id!,
          };
      const evidence = await retrieveIntelligenceEvidence(args.runtime.supabase, {
        ...tenantScope,
        domainHost: command.domainHost,
        sourceKinds: command.sourceKinds,
        observedAfter: command.observedAfter,
        limit: command.limit,
      });
      result = evidence.status === 'ready'
        ? ready({
            evidence: evidence.evidence.map((item) => ({
              evidenceId: item.evidenceId,
              sourceKind: item.sourceKind,
              observedAt: item.observedAt,
              excerpt: item.excerpt,
              sourceUrl: item.sourceUrl,
              qualityState: item.qualityState,
            })),
            limitations: evidence.limitations,
          })
        : failure('insufficient_evidence', 'insufficient_evidence', evidence.limitations.join(' '));
    } else if (command.capability === 'explain_measurement') {
      const report = await loadLatestAgencyReport({
        supabase: args.runtime.supabase,
        agencyClientId: command.agencyClientId,
      });
      result = report
        ? ready({ explanation: measurementExplanation(command.claim, report) })
        : failure('insufficient_evidence', 'incompatible_measurement', 'No quality-valid, context-compatible measurement is available.');
    } else if (command.capability === 'generate_artifact') {
      const report = await loadLatestAgencyReport({
        supabase: args.runtime.supabase,
        agencyClientId: command.agencyClientId,
      });
      if (!report) {
        result = failure('insufficient_evidence', 'incompatible_measurement', 'No quality-valid, context-compatible measurement is available.');
      } else {
        const bytes = await (args.runtime.buildPdf ?? buildAgencyReportPdf)(report.snapshot);
        result = ready({
          artifact: {
            artifactKind: 'agency_visibility_report' as const,
            contentType: 'application/pdf' as const,
            fileName: safeFileName(report.snapshot.clientName),
            byteLength: bytes.byteLength,
            sha256: createHash('sha256').update(bytes).digest('hex'),
            bytes,
            persisted: false as const,
            shared: false as const,
            delivered: false as const,
          },
        });
      }
    } else {
      const preview = await loadReportPreviewPayload({
        supabase: args.runtime.supabase,
        agencyClientId: command.agencyClientId,
      });
      result = preview
        ? ready({ preview })
        : failure('insufficient_evidence', 'insufficient_evidence', 'No stored measurement is available to preview.');
    }
    await audit(args.runtime, command, result.status === 'ready' ? 'ready' : 'insufficient_evidence');
    return result;
  } catch {
    await audit(args.runtime, request.data, 'failed');
    return failure('failed', 'capability_failed', 'The capability failed without exposing internal details.', true);
  }
}

type RequestFor<C extends OrganizationCapabilityRequest['capability']> = Extract<
  OrganizationCapabilityRequest,
  { readonly capability: C }
>;

export const detectOrganizationContextCapability = (
  runtime: OrganizationCapabilityRuntime,
  access: OrganizationCapabilityAccess,
  request: RequestFor<'detect_context'>,
) => executeOrganizationCapability({ runtime, access, request });

export const readOrganizationContextCapability = (
  runtime: OrganizationCapabilityRuntime,
  access: OrganizationCapabilityAccess,
  request: RequestFor<'read_context'>,
) => executeOrganizationCapability({ runtime, access, request });

export const listOrganizationMarketsCapability = (
  runtime: OrganizationCapabilityRuntime,
  access: OrganizationCapabilityAccess,
  request: RequestFor<'list_markets'>,
) => executeOrganizationCapability({ runtime, access, request });

export const retrieveOrganizationEvidenceCapability = (
  runtime: OrganizationCapabilityRuntime,
  access: OrganizationCapabilityAccess,
  request: RequestFor<'retrieve_evidence'>,
) => executeOrganizationCapability({ runtime, access, request });

export const explainOrganizationMeasurementCapability = (
  runtime: OrganizationCapabilityRuntime,
  access: OrganizationCapabilityAccess,
  request: RequestFor<'explain_measurement'>,
) => executeOrganizationCapability({ runtime, access, request });

export const generateOrganizationArtifactCapability = (
  runtime: OrganizationCapabilityRuntime,
  access: OrganizationCapabilityAccess,
  request: RequestFor<'generate_artifact'>,
) => executeOrganizationCapability({ runtime, access, request });

export const previewOrganizationArtifactCapability = (
  runtime: OrganizationCapabilityRuntime,
  access: OrganizationCapabilityAccess,
  request: RequestFor<'preview_artifact'>,
) => executeOrganizationCapability({ runtime, access, request });
