import { describe, expect, it } from 'vitest';
import fixture from '@/eval/fixtures/organization-capabilities-golden-v1.json';
import {
  ORGANIZATION_CAPABILITY_CONTRACT_VERSION,
  ORGANIZATION_CAPABILITY_DEFINITIONS,
  organizationCapabilityAccessSchema,
  organizationCapabilityJsonSchema,
  organizationCapabilityRequestSchema,
} from './organization-context-capabilities';

const ids = {
  actor: '30000000-0000-4000-8000-000000000001',
  client: '30000000-0000-4000-8000-000000000002',
  domain: '30000000-0000-4000-8000-000000000003',
};

function base() {
  return {
    contractVersion: ORGANIZATION_CAPABILITY_CONTRACT_VERSION,
    audit: {
      requestId: 'request-1',
      actorId: ids.actor,
      requestedAt: '2026-08-02T12:00:00.000Z',
      purpose: 'Customer report preview',
    },
    target: { type: 'agency_client', id: ids.client },
  } as const;
}

describe('Organization capability contracts', () => {
  it('publishes one stable Zod/JSON Schema boundary for all seven internal capabilities', () => {
    expect(organizationCapabilityJsonSchema.$id).toContain(ORGANIZATION_CAPABILITY_CONTRACT_VERSION);
    expect(organizationCapabilityJsonSchema.properties.capability.enum).toEqual(
      ORGANIZATION_CAPABILITY_DEFINITIONS.map((definition) => definition.name),
    );
    expect(ORGANIZATION_CAPABILITY_DEFINITIONS).toHaveLength(7);
    expect(organizationCapabilityJsonSchema.allOf).toHaveLength(7);
    expect(ORGANIZATION_CAPABILITY_DEFINITIONS.every((definition) =>
      !definition.producesExternalEffect && !definition.permitsExternalDelivery
    )).toBe(true);
    expect(fixture.cases.map((entry) => entry.id)).toEqual([
      'golden_exact_tenant_read',
      'golden_generation_without_delivery',
      'adversarial_cross_client_scope',
      'adversarial_incompatible_measurement',
      'adversarial_unsupported_claim',
      'adversarial_delivery_escalation',
    ]);
  });

  it('accepts an exact read and rejects unsupported claims or delivery escalation fields', () => {
    expect(organizationCapabilityRequestSchema.safeParse({
      ...base(), capability: 'read_context', domainId: ids.domain,
    }).success).toBe(true);
    expect(organizationCapabilityRequestSchema.safeParse({
      ...base(), capability: 'explain_measurement', agencyClientId: ids.client,
      claim: 'why_did_revenue_change',
    }).success).toBe(false);
    expect(organizationCapabilityRequestSchema.safeParse({
      ...base(), capability: 'generate_artifact', agencyClientId: ids.client,
      artifactKind: 'agency_visibility_report', deliverTo: 'customer@example.com',
    }).success).toBe(false);
  });

  it('requires generation and preview to target the exact agency client', () => {
    expect(organizationCapabilityRequestSchema.safeParse({
      ...base(),
      target: { type: 'agency_account', id: ids.client },
      capability: 'generate_artifact',
      agencyClientId: ids.client,
      artifactKind: 'agency_visibility_report',
    }).success).toBe(false);
  });

  it('keeps operation permissions independent, including external delivery', () => {
    const access = organizationCapabilityAccessSchema.parse({
      actorId: ids.actor,
      scopes: [base().target],
      permissions: {
        read: true,
        generateArtifact: true,
        previewArtifact: false,
        externalDelivery: false,
      },
    });
    expect(access.permissions).toEqual({
      read: true,
      generateArtifact: true,
      previewArtifact: false,
      externalDelivery: false,
    });
  });
});
