/**
 * VCI-8 local end-to-end verification (ECP-1 → ECP-4 write paths).
 *
 *   npx supabase start
 *   NEXT_PUBLIC_SUPABASE_URL=<local> SUPABASE_SERVICE_ROLE_KEY=<local> \
 *     node ./node_modules/tsx/dist/cli.mjs scripts/vci8-local-e2e.ts
 *
 * Drives the real library functions against a real Postgres + PostgREST: create the intervention,
 * store the contract, freeze the audience, run the preflight, and attempt to schedule. Unit tests
 * cover this logic against stubs — this covers the part stubs get wrong. The 1000-row response cap
 * that truncated every suppression read was invisible to the mocks and obvious here.
 *
 * LOCAL ONLY, and enforced: this creates campaign rows and enrollments, which must never appear in
 * production outside a reviewed launch.
 */
import { createServiceRoleClient } from '../lib/supabase/service-role';
import { resolveDatabaseTarget } from '../lib/server/database-target';
import {
  AGENCY_CHALLENGER_CAMPAIGN_ID,
  AGENCY_REPORTING_PILOT_CONTENT,
  AGENCY_REPORTING_PILOT_GOAL,
  AGENCY_REPORTING_PILOT_KEY,
  AGENCY_REPORTING_PILOT_RECIPIENTS,
  AGENCY_REPORTING_PILOT_SCHEDULE,
  AGENCY_REPORTING_PILOT_SEGMENT,
  AGENCY_REPORTING_PILOT_TRACKING,
} from '../lib/server/agency-reporting-pilot';
import { createDraftContract, versionChecksum, type EmailCampaignV1 } from '../lib/server/email-campaign-contract';
import { loadEmailCampaign, saveEmailCampaign } from '../lib/server/email-campaign-store';
import { resolveCampaignSender } from '../lib/server/email-campaign-sender';
import {
  freezeCampaignAudience,
  loadAudienceCandidates,
  loadAudienceEvidence,
  selectCampaignAudience,
  verifyFrozenAudience,
} from '../lib/server/campaign-audience';
import { runCampaignPreflight } from '../lib/server/email-campaign-preflight';
import { scheduleCampaign } from '../lib/server/email-campaign-schedule';
import { loadCampaignResults } from '../lib/server/email-campaign-results';

function check(label: string, pass: boolean, detail = ''): boolean {
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${label}${detail ? ` — ${detail}` : ''}`);
  return pass;
}

async function main(): Promise<void> {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');

  const target = resolveDatabaseTarget(url);
  if (!target.isLocal) {
    throw new Error(`refusing to run against ${target.host}: this script creates campaign rows and enrollments, and is local-only`);
  }
  console.log(`[e2e] target ${target.host} (local)\n`);

  const supabase = createServiceRoleClient(url, key);
  const results: boolean[] = [];

  // ── 1. Intervention row ──────────────────────────────────────────────────────
  const { data: existing } = await supabase
    .from('growth_campaign_interventions')
    .select('id')
    .eq('intervention_key', AGENCY_REPORTING_PILOT_KEY)
    .maybeSingle();

  // Repeatable local fixture cleanup, after the hard local-target guard above. Only rows carrying
  // this test intervention are removed; founder contacts and unrelated campaigns are untouched.
  if (existing?.id) {
    const existingId = String(existing.id);
    const { error: prospectCleanupError } = await supabase
      .from('outreach_prospects')
      .delete()
      .eq('growth_intervention_id', existingId);
    if (prospectCleanupError) throw new Error(`local prospect fixture cleanup failed: ${prospectCleanupError.message}`);
    const { error: interventionCleanupError } = await supabase
      .from('growth_campaign_interventions')
      .delete()
      .eq('id', existingId);
    if (interventionCleanupError) throw new Error(`local intervention fixture cleanup failed: ${interventionCleanupError.message}`);
  }

  let interventionId: string | null = null;
  if (!interventionId) {
    const { data, error } = await supabase
      .from('growth_campaign_interventions')
      .insert({
        campaign_id: AGENCY_CHALLENGER_CAMPAIGN_ID,
        intervention_key: AGENCY_REPORTING_PILOT_KEY,
        name: 'Agency reporting — Montreal',
        channel: 'email',
        status: 'planned',
        hypothesis: 'An accurate white-labelled client baseline is a reason for an agency owner to reply.',
        meaningful_variable: AGENCY_REPORTING_PILOT_GOAL.meaningfulVariable,
        success_condition: AGENCY_REPORTING_PILOT_GOAL.successCondition,
        stop_condition: AGENCY_REPORTING_PILOT_GOAL.stopCondition,
        metadata: { owner: 'elena', one_variable_only: true },
      })
      .select('id')
      .single();
    if (error || !data?.id) throw new Error(`intervention insert failed: ${error?.message ?? 'no id'}`);
    interventionId = String(data.id);
  }
  results.push(check('intervention row exists', Boolean(interventionId)));

  // ── 2. Contract ──────────────────────────────────────────────────────────────
  const sender = resolveCampaignSender(process.env as Record<string, string | undefined>);
  const draft: EmailCampaignV1 = createDraftContract({
    campaignId: AGENCY_CHALLENGER_CAMPAIGN_ID,
    interventionId,
    interventionKey: AGENCY_REPORTING_PILOT_KEY,
    goal: AGENCY_REPORTING_PILOT_GOAL,
    sender,
    segment: AGENCY_REPORTING_PILOT_SEGMENT,
    content: AGENCY_REPORTING_PILOT_CONTENT,
    tracking: AGENCY_REPORTING_PILOT_TRACKING,
    schedule: { ...AGENCY_REPORTING_PILOT_SCHEDULE, startAt: null },
  });
  const saved = await saveEmailCampaign(supabase, draft);
  results.push(check('contract stored on the intervention', saved.ok, saved.ok ? '' : saved.reason));

  const reloaded = await loadEmailCampaign(supabase, AGENCY_REPORTING_PILOT_KEY);
  results.push(check('contract round-trips out of storage', reloaded?.contract.version === 1));

  // ── 3. Freeze the audience ───────────────────────────────────────────────────
  // The real CSV remains unverified until each address has an auditable public source URL. This
  // local-only fixture supplies that evidence so the authorized write path can still be exercised
  // end to end without weakening production eligibility.
  const fixtureContacts = Array.from({ length: AGENCY_REPORTING_PILOT_RECIPIENTS }, (_, index) => ({
    email: `vci8-owner-${String(index + 1).padStart(2, '0')}@example.test`,
    name: `VCI8 Owner ${String(index + 1).padStart(2, '0')}`,
    company: `VCI8 Agency ${String(index + 1).padStart(2, '0')}`,
    company_domain: 'example.test',
    url: 'https://example.test',
    segment: AGENCY_REPORTING_PILOT_SEGMENT,
    tags: ['local-e2e'],
    city: 'Montreal',
    region: 'Montreal',
    contact_title: 'Owner',
    source: 'vci8-local-e2e',
    source_class: 'operator_manual',
    eligibility_status: 'eligible',
    eligibility_reason: 'local_e2e_fixture_with_public_source',
    eligibility_checked_at: new Date().toISOString(),
    personalization_source_url: `https://directory.example/vci8-owner-${String(index + 1)}`,
    provenance: { local_e2e: true, public_source_url: `https://directory.example/vci8-owner-${String(index + 1)}` },
    updated_at: new Date().toISOString(),
  }));
  const { error: fixtureError } = await supabase
    .from('outreach_contacts')
    .upsert(fixtureContacts, { onConflict: 'email' });
  if (fixtureError) throw new Error(`local fixture insert failed: ${fixtureError.message}`);

  const [candidates, evidence] = await Promise.all([
    loadAudienceCandidates(supabase, AGENCY_REPORTING_PILOT_SEGMENT),
    loadAudienceEvidence(supabase),
  ]);
  results.push(check('at least 25 evidenced candidates loaded from the segment', candidates.length >= 25, `${String(candidates.length)} candidates`));

  const selection = selectCampaignAudience({ candidates, evidence, limit: AGENCY_REPORTING_PILOT_RECIPIENTS });
  results.push(check('cohort is exactly the cap', selection.members.length === 25, `${String(selection.members.length)} selected`));
  results.push(check(
    'every excluded contact has a named reason',
    selection.excluded.length === Object.values(selection.excludedCounts).reduce((sum, count) => sum + count, 0)
      && selection.excluded.length === candidates.length - selection.members.length,
    JSON.stringify(selection.excludedCounts),
  ));

  const frozen = await freezeCampaignAudience({
    supabase,
    campaignId: AGENCY_CHALLENGER_CAMPAIGN_ID,
    interventionId,
    interventionKey: AGENCY_REPORTING_PILOT_KEY,
    campaignVersion: 1,
    sourceSegment: AGENCY_REPORTING_PILOT_SEGMENT,
    selection,
    selectionReason: '25 strongest eligible Montreal agency decision-makers',
  });
  results.push(check('audience frozen', frozen.ok, frozen.ok ? `${String(frozen.audience.recipientCount)} recipients` : frozen.reason));
  if (!frozen.ok) throw new Error('cannot continue without a frozen audience');

  const refreeze = await freezeCampaignAudience({
    supabase,
    campaignId: AGENCY_CHALLENGER_CAMPAIGN_ID,
    interventionId,
    interventionKey: AGENCY_REPORTING_PILOT_KEY,
    campaignVersion: 1,
    sourceSegment: AGENCY_REPORTING_PILOT_SEGMENT,
    selection,
    selectionReason: 'second call',
  });
  results.push(check(
    're-freezing returns the reviewed snapshot instead of replacing it',
    refreeze.ok && !refreeze.created && refreeze.audience.id === frozen.audience.id,
  ));

  const verified = await verifyFrozenAudience(supabase, frozen.audience.id);
  results.push(check('stored audience checksum recomputes', verified.ok, verified.ok ? verified.checksum.slice(0, 16) : verified.reason));

  // ── 4. Preflight with no authenticated sender (the current production state) ──
  const contract: EmailCampaignV1 = {
    ...draft,
    audience: {
      ...draft.audience,
      audienceId: frozen.audience.id,
      checksum: frozen.audience.checksum,
      recipientCount: frozen.audience.recipientCount,
      frozenAt: new Date().toISOString(),
      excludedCounts: selection.excludedCounts as Record<string, number>,
    },
    schedule: { ...draft.schedule, startAt: new Date(Date.now() + 7 * 86_400_000).toISOString() },
  };

  const { result: preflight } = await runCampaignPreflight({
    supabase,
    env: process.env as Record<string, string | undefined>,
    contract,
    nowMs: Date.now(),
  });
  const gate = (key: string) => preflight.gates.find((item) => item.key === key);
  results.push(check('preflight fails closed overall', !preflight.ok, `${String(preflight.failures.length)} failing gates`));
  results.push(check('sender gate fails', gate('sender_authenticated')?.ok === false));
  results.push(check('internal test gate fails', gate('internal_test_accepted')?.ok === false));
  results.push(check('audience is frozen and undrifted', gate('audience_frozen')?.ok === true && gate('audience_not_drifted')?.ok === true));
  results.push(check('all 25 recipients are eligible', gate('recipients_eligible')?.ok === true, gate('recipients_eligible')?.detail));
  results.push(check('every merge field resolves for every recipient', gate('merge_fields_resolve')?.ok === true, gate('merge_fields_resolve')?.detail));
  results.push(check('resolved recipient count matches the reviewed count', gate('recipients_within_cap')?.ok === true, gate('recipients_within_cap')?.detail));

  // ── 5. Scheduling must refuse, and must write nothing ────────────────────────
  const outcome = await scheduleCampaign({
    supabase,
    env: process.env as Record<string, string | undefined>,
    contract,
    nowMs: Date.now(),
    save: async (updated) => saveEmailCampaign(supabase, updated),
  });
  results.push(check('scheduling refused', !outcome.ok, outcome.ok ? '' : outcome.reason));

  const { count: enrollmentCount } = await supabase
    .from('outreach_campaign_enrollments')
    .select('id', { head: true, count: 'exact' });
  const { count: prospectCount } = await supabase
    .from('outreach_prospects')
    .select('id', { head: true, count: 'exact' });
  results.push(check('a refused schedule created no enrollment', (enrollmentCount ?? 0) === 0));
  results.push(check('a refused schedule created no prospect', (prospectCount ?? 0) === 0));

  // ── 6. Results read against real ledgers ─────────────────────────────────────
  const campaignResults = await loadCampaignResults({ supabase, contract, nowMs: Date.now() });
  const stage = (key: string) => campaignResults.funnel.find((item) => item.key === key);
  results.push(check('eligible stage reflects the frozen cohort', stage('eligible')?.count === 25));
  results.push(check('clicked is unavailable, not zero', stage('clicked')?.count === null));
  results.push(check('no revenue is claimed', stage('active_recurring_subscription')?.count === 0));
  results.push(check('decision withholds judgement before the threshold', campaignResults.closure.decision === 'not_enough_evidence', campaignResults.closure.rationale));

  // ── 7. The authorized path ───────────────────────────────────────────────────
  // Simulates the one thing production is still missing: an authenticated sender and an accepted
  // internal test. Scheduling never contacts a provider — it writes rows and lets the existing
  // hourly sweep deliver — so this exercises the real write path with no risk of sending.
  console.log('\n[e2e] simulating an authenticated sender to exercise the authorized schedule\n');
  const authorizedEnv: Record<string, string | undefined> = {
    ...(process.env as Record<string, string | undefined>),
    GEOPULSE_CAMPAIGN_FROM_EMAIL: 'elena@getgeopulse.com',
    GEOPULSE_CAMPAIGN_REPLY_TO_EMAIL: 'elena@getgeopulse.com',
    GEOPULSE_CAMPAIGN_SENDER_VERIFIED: 'true',
  };

  // 09:00 America/Toronto (EDT) a week out, inside the approved window.
  const start = new Date(Date.now() + 7 * 86_400_000);
  start.setUTCHours(13, 0, 0, 0);
  const authorizedSender = resolveCampaignSender(authorizedEnv);
  const ready: EmailCampaignV1 = {
    ...contract,
    sender: authorizedSender,
    schedule: { ...contract.schedule, startAt: start.toISOString() },
  };
  const authorized: EmailCampaignV1 = {
    ...ready,
    governance: {
      ...ready.governance,
      testAcceptedAt: new Date().toISOString(),
      testVersionChecksum: versionChecksum(ready),
      testRecipients: ['qa@getgeopulse.com'],
    },
  };

  const green = await scheduleCampaign({
    supabase,
    env: authorizedEnv,
    contract: authorized,
    nowMs: Date.now(),
    save: async (updated) => saveEmailCampaign(supabase, updated),
  });
  results.push(check('authorized schedule succeeds', green.ok, green.ok ? `${String(green.enrolled)} enrolled` : green.preflight.failures.join(' · ')));

  if (green.ok) {
    results.push(check('exactly 25 enrollments', green.enrolled === 25));

    const { data: rows } = await supabase
      .from('outreach_prospects')
      .select('email,next_run_at,sequence_step,max_sequence_steps,enabled,lifecycle_status,growth_intervention_id')
      .order('next_run_at', { ascending: true });
    const prospects = (rows ?? []) as Array<Record<string, unknown>>;
    results.push(check('exactly 25 prospects created', prospects.length === 25));
    results.push(check('all carry campaign lineage', prospects.every((row) => row.growth_intervention_id === interventionId)));
    results.push(check('all start at step 1 of 3', prospects.every((row) => row.sequence_step === 1 && row.max_sequence_steps === 3)));

    const times = prospects.map((row) => Date.parse(String(row.next_run_at)));
    const gaps = times.slice(1).map((value, index) => (value - (times[index] ?? 0)) / 60_000);
    results.push(check('sends are staggered 15 minutes apart', gaps.every((gap) => gap === 15), `first ${String(new Date(times[0] ?? 0).toISOString())}`));
    results.push(check('nothing is scheduled in the past', times.every((value) => value > Date.now())));

    // Retry must not produce a second cohort.
    const retry = await scheduleCampaign({
      supabase,
      env: authorizedEnv,
      contract: authorized,
      nowMs: Date.now(),
      save: async (updated) => saveEmailCampaign(supabase, updated),
    });
    results.push(check('a retried schedule enrolls nobody twice', retry.ok && retry.enrolled === 0, retry.ok ? `${String(retry.alreadyEnrolled)} already enrolled` : ''));

    const { count: afterRetry } = await supabase
      .from('outreach_campaign_enrollments')
      .select('id', { head: true, count: 'exact' });
    results.push(check('still exactly 25 enrollments after the retry', (afterRetry ?? 0) === 25));

    // Stop must make further sends impossible.
    const { stopCampaign } = await import('../lib/server/email-campaign-schedule');
    const stopped = await stopCampaign({
      supabase,
      contract: { ...authorized, state: 'scheduled' },
      reason: 'local e2e verification',
      nowMs: Date.now(),
      save: async (updated) => saveEmailCampaign(supabase, updated),
    });
    results.push(check('stop closes every enrollment', stopped.ok, stopped.ok ? `${String(stopped.stoppedProspects)} prospects disabled` : stopped.reason));

    const { data: afterStop } = await supabase.from('outreach_prospects').select('enabled');
    results.push(check(
      'a stopped campaign leaves no sendable prospect',
      ((afterStop ?? []) as Array<{ enabled: boolean }>).every((row) => !row.enabled),
    ));
  }

  console.log(`\nversion checksum ${versionChecksum(contract)}`);
  const failed = results.filter((pass) => !pass).length;
  console.log(`\n${String(results.length - failed)}/${String(results.length)} checks passed`);
  if (failed > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
