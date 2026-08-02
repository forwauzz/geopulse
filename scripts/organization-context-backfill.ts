import { ORGANIZATION_CONTEXT_BACKFILL_CONFIRMATION } from '../lib/intelligence/organization-context-backfill';
import {
  applyOrganizationContextBackfill,
  createSupabaseOrganizationContextBackfillStore,
  previewOrganizationContextBackfill,
} from '../lib/server/organization-context-backfill';
import { createServiceRoleClient } from '../lib/supabase/service-role';

function flag(name: string): string | null {
  const prefix = `${name}=`;
  const value = process.argv.slice(2).find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : null;
}

async function main(): Promise<void> {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) throw new Error('Missing Supabase service-role environment.');
  const apply = process.argv.slice(2).includes('--apply');
  const confirmation = flag('--confirm');
  if (apply && confirmation !== ORGANIZATION_CONTEXT_BACKFILL_CONFIRMATION) {
    throw new Error(`Apply requires --confirm=${ORGANIZATION_CONTEXT_BACKFILL_CONFIRMATION}.`);
  }
  const store = createSupabaseOrganizationContextBackfillStore(createServiceRoleClient(url, key));
  const preview = await previewOrganizationContextBackfill({ store });
  console.log(JSON.stringify({
    ...preview,
    records: preview.records.map((item) => ({
      configId: item.configId,
      ownerType: item.ownerType,
      domainId: item.domainId,
      classification: item.classification,
      reasons: item.reasons,
      contextVersion: item.context?.contextVersion ?? null,
      routedToAuthorizedUser: Boolean(item.routedUserId),
      alreadyApplied: item.alreadyApplied,
    })),
  }, null, 2));
  if (!apply) return;
  const result = await applyOrganizationContextBackfill({
    store,
    confirmation: confirmation!,
  });
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
