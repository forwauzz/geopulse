import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { importPlaybookDrafts } from '@/lib/server/content-draft-import';
import { seedTopicPageItems } from '@/lib/server/content-topic-page-admin';

function readRequiredEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required env: ${key}`);
  }
  return value;
}

async function main() {
  const url = readRequiredEnv('NEXT_PUBLIC_SUPABASE_URL');
  const serviceRoleKey = readRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createServiceRoleClient(url, serviceRoleKey);

  const importResult = await importPlaybookDrafts(supabase, null);
  const seedResult = await seedTopicPageItems(supabase, null);

  console.log(
    JSON.stringify(
      {
        importedCount: importResult.importedCount,
        importedContentIds: importResult.items.map((item) => item.content_id),
        seededCount: seedResult.seededCount,
        topicKeys: seedResult.topicKeys,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
