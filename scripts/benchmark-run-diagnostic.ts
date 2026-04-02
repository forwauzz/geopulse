import { createBenchmarkAdminData } from '../lib/server/benchmark-admin-data';
import { buildBenchmarkRunDiagnostic } from '../lib/server/benchmark-run-diagnostic';
import { createServiceRoleClient } from '../lib/supabase/service-role';

function parseArgs(argv: string[]): { runGroupIds: string[] } {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token || !token.startsWith('--')) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) continue;
    values.set(token.slice(2), value);
    index += 1;
  }

  const runGroupIds = (values.get('run-group-ids') ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return { runGroupIds };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  if (args.runGroupIds.length === 0) {
    console.error('Missing --run-group-ids. Example: --run-group-ids run-1,run-2');
    process.exit(1);
  }

  const supabase = createServiceRoleClient(url, key);
  const adminData = createBenchmarkAdminData(supabase as any);

  for (const runGroupId of args.runGroupIds) {
    const detail = await adminData.getRunGroupDetail(runGroupId);
    if (!detail) {
      console.log(`benchmark run diagnostic: ${runGroupId}`);
      console.log('  status: not_found');
      continue;
    }

    const diagnostic = buildBenchmarkRunDiagnostic(detail);
    console.log(`benchmark run diagnostic: ${diagnostic.runGroupId}`);
    console.log(`  domain: ${diagnostic.canonicalDomain}`);
    console.log(`  run_mode: ${diagnostic.runMode ?? '-'}`);
    console.log(`  query_count: ${diagnostic.queryCount}`);
    console.log(`  citation_count: ${diagnostic.citationCount}`);
    console.log(`  page_url_citations: ${diagnostic.pageUrlCitationCount}`);
    console.log(`  domain_only_citations: ${diagnostic.domainOnlyCitationCount}`);
    console.log(`  matched_citations: ${diagnostic.matchedCitationCount}`);
    console.log(`  exact_url_matches: ${diagnostic.exactUrlMatchCount}`);
    console.log(`  normalized_page_matches: ${diagnostic.normalizedPageMatchCount}`);
    console.log(`  supported_overlap: ${diagnostic.supportedOverlapCount}`);
    console.log(`  weak_or_no_overlap: ${diagnostic.weakOrNoOverlapCount}`);
    console.log(`  grounding_evidence_count: ${diagnostic.groundingEvidenceCount}`);
    console.log(
      `  probable_issue: ${
        diagnostic.pageUrlCitationCount > 0 && diagnostic.matchedCitationCount === 0
          ? 'matcher_or_normalization_gap'
          : diagnostic.pageUrlCitationCount === 0
            ? 'model_returning_domain_level_or_no_urls'
            : diagnostic.supportedOverlapCount === 0
              ? 'matched_urls_without_supported_overlap'
              : 'mixed_or_needs_manual_review'
      }`
    );
    console.log(`  sample_cited_urls: ${diagnostic.sampleCitedUrls.join(' | ') || '-'}`);
    console.log(
      `  sample_matched_grounding_urls: ${diagnostic.sampleMatchedGroundingUrls.join(' | ') || '-'}`
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
