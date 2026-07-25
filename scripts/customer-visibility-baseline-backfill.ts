import { createServiceRoleClient } from '../lib/supabase/service-role';
import {
  ensureFreeVisibilityWorkspace,
  provisionCustomerVisibilityBaseline,
} from '../lib/server/customer-visibility-baseline';

async function main(): Promise<void> {
const url = process.env['NEXT_PUBLIC_SUPABASE_URL']?.trim() ?? '';
const key = process.env['SUPABASE_SERVICE_ROLE_KEY']?.trim() ?? '';
const apply = process.argv.includes('--apply');
if (!url || !key) throw new Error('Supabase service-role environment is required.');
if (!apply) {
  console.log('Dry run only. Pass --apply to provision baselines.');
  process.exit(0);
}

const supabase = createServiceRoleClient(url, key);
let provisioned = 0;
let failed = 0;

const { data: clients, error: clientError } = await supabase
  .from('agency_clients')
  .select('agency_account_id,name,canonical_domain,vertical,subvertical,status')
  .eq('status', 'active')
  .not('canonical_domain', 'is', null);
if (clientError) throw clientError;
for (const client of clients ?? []) {
  const result = await provisionCustomerVisibilityBaseline(supabase, {
    agencyAccountId: client.agency_account_id,
    domain: client.canonical_domain,
    companyName: client.name,
    vertical: client.vertical,
    subvertical: client.subvertical,
    source: 'backfill',
  });
  if (result.ok) provisioned += 1;
  else {
    failed += 1;
    console.error(`Agency baseline failed for ${client.canonical_domain}: ${result.reason}`);
  }
}

const { data: memberships, error: membershipError } = await supabase
  .from('startup_workspace_users')
  .select('startup_workspace_id')
  .eq('status', 'active');
if (membershipError) throw membershipError;
const workspaceIds = [...new Set((memberships ?? []).map((row) => row.startup_workspace_id))];
if (workspaceIds.length > 0) {
  const { data: workspaces, error: workspaceError } = await supabase
    .from('startup_workspaces')
    .select('id,name,canonical_domain')
    .in('id', workspaceIds)
    .not('canonical_domain', 'is', null);
  if (workspaceError) throw workspaceError;
  for (const workspace of workspaces ?? []) {
    const result = await provisionCustomerVisibilityBaseline(supabase, {
      startupWorkspaceId: workspace.id,
      domain: workspace.canonical_domain,
      companyName: workspace.name,
      source: 'backfill',
    });
    if (result.ok) provisioned += 1;
    else {
      failed += 1;
      console.error(`Startup baseline failed for ${workspace.canonical_domain}: ${result.reason}`);
    }
  }
}

const memberUserIds = new Set<string>();
const { data: startupMembers } = await supabase
  .from('startup_workspace_users')
  .select('user_id')
  .eq('status', 'active');
for (const row of startupMembers ?? []) memberUserIds.add(row.user_id);
const { data: agencyMembers } = await supabase
  .from('agency_users')
  .select('user_id')
  .eq('status', 'active');
for (const row of agencyMembers ?? []) memberUserIds.add(row.user_id);

const { data: scans, error: scanError } = await supabase
  .from('scans')
  .select('user_id,domain,created_at')
  .not('user_id', 'is', null)
  .not('domain', 'is', null)
  .order('created_at', { ascending: false })
  .limit(2000);
if (scanError) throw scanError;
const newestDomainByUser = new Map<string, string>();
for (const scan of scans ?? []) {
  if (!newestDomainByUser.has(scan.user_id) && !memberUserIds.has(scan.user_id)) {
    newestDomainByUser.set(scan.user_id, scan.domain);
  }
}
for (const [userId, domain] of newestDomainByUser) {
  const result = await ensureFreeVisibilityWorkspace({
    supabase,
    userId,
    domain,
  });
  if (result.ok && result.baseline.ok) {
    provisioned += 1;
  } else {
    failed += 1;
    const reason = result.ok
      ? (result.baseline.ok ? 'unknown' : result.baseline.reason)
      : result.reason;
    console.error(`Self-serve baseline failed for ${domain}: ${reason}`);
  }
}

console.log(JSON.stringify({ provisioned, failed, completedAt: new Date().toISOString() }));
if (failed > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
