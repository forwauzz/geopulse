import { describe, expect, it } from 'vitest';
import {
  CONNECTOR_ACCOUNT_VERSION,
  CONNECTOR_CONTACT_VERSION,
  CONNECTOR_GENERATION_REQUEST_VERSION,
  CONNECTOR_PROVIDER_EVENT_VERSION,
  CONNECTOR_REPORT_SYNC_VERSION,
  connectorAccountSchema,
  contactProjectionSchema,
  generationRequestSchema,
  providerEventSchema,
  reportSyncProjectionSchema,
} from './crm-contract';

const TENANT_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_TENANT_ID = '99999999-9999-4999-8999-999999999999';
const ACCOUNT_ID = '22222222-2222-4222-8222-222222222222';

const tenant = { type: 'startup_workspace' as const, id: TENANT_ID };

describe('CRM connector contracts', () => {
  it('stores a credential reference, never token material, on connector accounts', () => {
    const account = {
      contractVersion: CONNECTOR_ACCOUNT_VERSION,
      accountId: ACCOUNT_ID,
      tenant,
      provider: 'brevo',
      externalAccountId: 'brevo-test-account',
      credentialRef: '33333333-3333-4333-8333-333333333333',
      scopes: ['contacts:read', 'contacts:write'],
      status: 'connected',
      connectedAt: '2026-08-11T12:00:00.000Z',
      expiresAt: null,
      disconnectedAt: null,
    };
    expect(connectorAccountSchema.parse(account)).toEqual(account);
    expect(connectorAccountSchema.safeParse({ ...account, accessToken: 'secret' }).success).toBe(false);
  });

  it('limits the contact projection to fields needed for report generation and mapping', () => {
    const contact = {
      contractVersion: CONNECTOR_CONTACT_VERSION,
      accountId: ACCOUNT_ID,
      tenant,
      provider: 'brevo',
      providerContactId: 'contact-10',
      firstName: 'Morgan',
      companyName: 'Northstar Clinic',
      canonicalDomain: 'northstar.example',
      email: 'morgan@northstar.example',
      listIds: ['founder-canary'],
      suppressionState: 'eligible',
      sourceVersion: 'brevo-contact-v1',
      observedAt: '2026-08-11T12:00:00.000Z',
    };
    expect(contactProjectionSchema.parse(contact)).toEqual(contact);
    expect(contactProjectionSchema.safeParse({ ...contact, address: 'not required' }).success).toBe(false);
  });

  it('fails closed when connector, contact, sponsor, and report tenants differ', () => {
    const request = {
      contractVersion: CONNECTOR_GENERATION_REQUEST_VERSION,
      requestId: '44444444-4444-4444-8444-444444444444',
      connectorAccount: { accountId: ACCOUNT_ID, tenant },
      contact: { providerContactId: 'contact-10', tenant },
      sponsor: { profileId: 'sponsor-default', tenant },
      reportOwner: tenant,
      canonicalDomain: 'northstar.example',
      snapshotContractVersion: 'buyer-intelligence-snapshot-v1',
      reportView: 'prospect_preview',
      idempotencyKey: 'brevo:contact-10:2026-08:preview-v1',
      status: 'queued',
      attemptCount: 0,
      capDecision: { state: 'allowed', reason: null },
      createdAt: '2026-08-11T12:00:00.000Z',
    };
    expect(generationRequestSchema.safeParse(request).success).toBe(true);
    expect(generationRequestSchema.safeParse({
      ...request,
      contact: { ...request.contact, tenant: { ...tenant, id: OTHER_TENANT_ID } },
    }).success).toBe(false);
  });

  it('returns only approved report fields to the CRM', () => {
    const projection = {
      contractVersion: CONNECTOR_REPORT_SYNC_VERSION,
      accountId: ACCOUNT_ID,
      tenant,
      provider: 'brevo',
      providerContactId: 'contact-10',
      generationRequestId: '44444444-4444-4444-8444-444444444444',
      snapshotId: 'bis_northstar_2026_08',
      reportView: 'prospect_preview',
      status: 'ready',
      reportUrl: 'https://getgeopulse.com/share/signed-token',
      thumbnailUrl: 'https://getgeopulse.com/api/reports/thumbnail/signed-token',
      score: 68,
      summary: 'Three buyer questions need clearer, evidence-backed answers.',
      generatedAt: '2026-08-11T12:00:00.000Z',
      expiresAt: '2026-09-11T12:00:00.000Z',
    };
    expect(reportSyncProjectionSchema.parse(projection)).toEqual(projection);
  });

  it('normalizes provider events without persisting a raw payload', () => {
    const event = {
      contractVersion: CONNECTOR_PROVIDER_EVENT_VERSION,
      eventId: 'event-10',
      replayKey: 'brevo:event-10',
      payloadHash: `sha256:${'b'.repeat(64)}`,
      accountId: ACCOUNT_ID,
      tenant,
      provider: 'brevo',
      type: 'contact_updated',
      providerObjectId: 'contact-10',
      occurredAt: '2026-08-11T12:00:00.000Z',
      receivedAt: '2026-08-11T12:00:01.000Z',
    };
    expect(providerEventSchema.parse(event)).toEqual(event);
    expect(providerEventSchema.safeParse({ ...event, rawPayload: { email: 'private@example.com' } }).success).toBe(false);
  });
});
