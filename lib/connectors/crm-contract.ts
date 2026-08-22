import { z } from 'zod';
import { BUYER_INTELLIGENCE_SNAPSHOT_VERSION } from '../intelligence/buyer-intelligence-contract';

export const CONNECTOR_ACCOUNT_VERSION = 'crm-connector-account-v1';
export const CONNECTOR_CONTACT_VERSION = 'crm-contact-projection-v1';
export const CONNECTOR_GENERATION_REQUEST_VERSION = 'crm-generation-request-v1';
export const CONNECTOR_REPORT_SYNC_VERSION = 'crm-report-sync-v1';
export const CONNECTOR_PROVIDER_EVENT_VERSION = 'crm-provider-event-v1';

const nonEmpty = z.string().trim().min(1);
const datetime = z.string().datetime();
const nullableDatetime = datetime.nullable();
const providerSchema = z.enum(['brevo', 'hubspot']);
const tenantSchema = z.object({
  type: z.enum(['startup_workspace', 'agency_account']),
  id: z.string().uuid(),
}).strict();

export const connectorAccountSchema = z.object({
  contractVersion: z.literal(CONNECTOR_ACCOUNT_VERSION),
  accountId: z.string().uuid(),
  tenant: tenantSchema,
  provider: providerSchema,
  externalAccountId: nonEmpty,
  credentialRef: z.string().uuid(),
  scopes: z.array(nonEmpty).min(1),
  status: z.enum(['connected', 'expired', 'revoked', 'disconnected', 'error']),
  connectedAt: datetime,
  expiresAt: nullableDatetime,
  disconnectedAt: nullableDatetime,
}).strict().superRefine((account, context) => {
  if (account.status === 'disconnected' && account.disconnectedAt === null) {
    context.addIssue({ code: 'custom', path: ['disconnectedAt'], message: 'Disconnected accounts require a timestamp.' });
  }
  if (account.status !== 'disconnected' && account.disconnectedAt !== null) {
    context.addIssue({ code: 'custom', path: ['disconnectedAt'], message: 'Active account states cannot carry a disconnect timestamp.' });
  }
});

export const contactProjectionSchema = z.object({
  contractVersion: z.literal(CONNECTOR_CONTACT_VERSION),
  accountId: z.string().uuid(),
  tenant: tenantSchema,
  provider: providerSchema,
  providerContactId: nonEmpty,
  firstName: nonEmpty.nullable(),
  companyName: nonEmpty,
  canonicalDomain: z.string().trim().toLowerCase().regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/),
  email: z.string().email().nullable(),
  listIds: z.array(nonEmpty),
  suppressionState: z.enum([
    'unknown',
    'eligible',
    'suppressed',
    'unsubscribed',
    'bounced',
    'complained',
    'converted',
    'cancelled',
  ]),
  sourceVersion: nonEmpty,
  observedAt: datetime,
}).strict();

export const generationRequestSchema = z.object({
  contractVersion: z.literal(CONNECTOR_GENERATION_REQUEST_VERSION),
  requestId: z.string().uuid(),
  connectorAccount: z.object({ accountId: z.string().uuid(), tenant: tenantSchema }).strict(),
  contact: z.object({ providerContactId: nonEmpty, tenant: tenantSchema }).strict(),
  sponsor: z.object({ profileId: nonEmpty, tenant: tenantSchema }).strict(),
  reportOwner: tenantSchema,
  canonicalDomain: z.string().trim().toLowerCase().regex(/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/),
  snapshotContractVersion: z.literal(BUYER_INTELLIGENCE_SNAPSHOT_VERSION),
  reportView: z.enum(['prospect_preview', 'full_baseline', 'monthly_brief', 'agency_portfolio']),
  idempotencyKey: nonEmpty,
  status: z.enum(['draft', 'queued', 'running', 'quarantined', 'retrying', 'ready', 'synced', 'failed', 'cancelled']),
  attemptCount: z.number().int().min(0),
  capDecision: z.object({
    state: z.enum(['allowed', 'blocked']),
    reason: nonEmpty.nullable(),
  }).strict(),
  createdAt: datetime,
}).strict().superRefine((request, context) => {
  const expected = `${request.connectorAccount.tenant.type}:${request.connectorAccount.tenant.id}`;
  const tenants = [request.contact.tenant, request.sponsor.tenant, request.reportOwner]
    .map((tenant) => `${tenant.type}:${tenant.id}`);
  if (tenants.some((tenant) => tenant !== expected)) {
    context.addIssue({ code: 'custom', message: 'Connector, contact, sponsor, and report owner must share one tenant.' });
  }
  if (request.capDecision.state === 'allowed' && request.capDecision.reason !== null) {
    context.addIssue({ code: 'custom', path: ['capDecision', 'reason'], message: 'Allowed requests cannot carry a block reason.' });
  }
  if (request.capDecision.state === 'blocked' && request.capDecision.reason === null) {
    context.addIssue({ code: 'custom', path: ['capDecision', 'reason'], message: 'Blocked requests require a reason.' });
  }
});

export const reportSyncProjectionSchema = z.object({
  contractVersion: z.literal(CONNECTOR_REPORT_SYNC_VERSION),
  accountId: z.string().uuid(),
  tenant: tenantSchema,
  provider: providerSchema,
  providerContactId: nonEmpty,
  generationRequestId: z.string().uuid(),
  snapshotId: nonEmpty,
  reportView: z.enum(['prospect_preview', 'full_baseline', 'monthly_brief', 'agency_portfolio']),
  status: z.enum(['ready', 'synced', 'revoked', 'expired']),
  reportUrl: z.string().url(),
  thumbnailUrl: z.string().url().nullable(),
  score: z.number().min(0).max(100).nullable(),
  summary: nonEmpty,
  generatedAt: datetime,
  expiresAt: nullableDatetime,
}).strict();

export const providerEventSchema = z.object({
  contractVersion: z.literal(CONNECTOR_PROVIDER_EVENT_VERSION),
  eventId: nonEmpty,
  replayKey: nonEmpty,
  payloadHash: z.string().regex(/^sha256:[0-9a-f]{64}$/),
  accountId: z.string().uuid(),
  tenant: tenantSchema,
  provider: providerSchema,
  type: z.enum([
    'contact_updated',
    'contact_deleted',
    'unsubscribed',
    'bounced',
    'complained',
    'delivery_status_changed',
  ]),
  providerObjectId: nonEmpty,
  occurredAt: datetime,
  receivedAt: datetime,
}).strict();

export type ConnectorAccount = z.infer<typeof connectorAccountSchema>;
export type ContactProjection = z.infer<typeof contactProjectionSchema>;
export type GenerationRequest = z.infer<typeof generationRequestSchema>;
export type ReportSyncProjection = z.infer<typeof reportSyncProjectionSchema>;
export type ProviderEvent = z.infer<typeof providerEventSchema>;
