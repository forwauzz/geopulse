import { describe, expect, it } from 'vitest';
import { buildE2EServiceRoleClient, buildE2ESupabaseServerClient } from '@/lib/supabase/e2e-auth';
import { resolveStartupServiceGate } from '@/lib/server/startup-service-gates';

/**
 * The connectors page gates on `rolloutFlag && serviceEntitlement.enabled`.
 *
 * The E2E fixture workspace already sets `github_agent` / `slack_agent` in its rollout flags, but
 * the entitlement half needs a service-role client — and E2E deliberately has no service-role key.
 * The gates therefore resolved to null, every connector rendered its "not enabled" state, and 12
 * specs asserting the connected UI could never pass.
 *
 * Production ships these services as `off` and grants them per scope rather than flipping the
 * catalog default, so the fixture grants them the same way: a user-scoped override row.
 */

const E2E_STARTUP_WORKSPACE_ID = '00000000-0000-4000-8000-000000000101';
const E2E_ADMIN_USER_ID = '00000000-0000-4000-8000-000000000001';
const adminUser = { id: E2E_ADMIN_USER_ID, email: 'admin@example.com' };

async function gateFor(serviceKey: 'github_integration' | 'slack_integration' | 'api_access') {
  return resolveStartupServiceGate({
    memberSupabase: buildE2ESupabaseServerClient(adminUser),
    serviceSupabase: buildE2EServiceRoleClient(),
    startupWorkspaceId: E2E_STARTUP_WORKSPACE_ID,
    userId: E2E_ADMIN_USER_ID,
    serviceKey,
  });
}

describe('startup service gates against the E2E fixture', () => {
  it('enables the GitHub and Slack connectors', async () => {
    expect((await gateFor('github_integration')).enabled).toBe(true);
    expect((await gateFor('slack_integration')).enabled).toBe(true);
  });

  it('leaves un-granted services off, so the fixture is not blanket-enabling everything', async () => {
    // api_access is `off` in the catalog with no override — the grant must be the override, not
    // an accident of the fixture resolving everything to enabled.
    expect((await gateFor('api_access')).enabled).toBe(false);
  });
});
