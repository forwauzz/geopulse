import { describe, expect, it, vi } from 'vitest';

vi.mock('./organization-context-repository', () => ({
  loadConfirmedOrganizationContextByHost: vi.fn().mockResolvedValue(null),
}));

import { completeAgencyClientBaseline } from './agency-client-baseline';

function clientOnlySupabase() {
  const client = {
    id: '00000000-0000-4000-8000-000000000202',
    name: 'Example Client',
    display_name: 'Example Client',
    canonical_domain: 'client.example',
    website_domain: 'client.example',
    vertical: 'business services',
    subvertical: null,
    metadata: {},
  };
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: client, error: null }),
  };
  return { from: () => chain };
}

describe('agency client baseline context gate', () => {
  it('fails closed before provider work when the client has no confirmed Organization Context', async () => {
    const result = await completeAgencyClientBaseline({
      supabase: clientOnlySupabase() as never,
      env: {},
      agencyAccountId: '00000000-0000-4000-8000-000000000201',
      clientId: '00000000-0000-4000-8000-000000000202',
      userId: '00000000-0000-4000-8000-000000000203',
    });

    expect(result).toMatchObject({
      ok: false,
      configId: null,
      launchedPlatforms: [],
      reason: 'organization_context_confirmation_required',
    });
  });
});
