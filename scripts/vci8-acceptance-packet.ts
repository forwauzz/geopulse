/**
 * VCI-8 / ECP-5 local acceptance packet.
 *
 *   npm run vci8:acceptance -- --dir "C:\path\to\agency-outreach-list" --out ".\packet"
 *
 * Runs the whole flow locally and writes the evidence QA reviews, WITHOUT applying anything:
 *
 *   file hashes → dry-run intake plan → saved segments → 25-contact pilot cohort
 *   → the exact rendered messages → preflight → what is still held
 *
 * Nothing here writes to the contact bank, creates a prospect, enrolls anyone, contacts a
 * provider, or activates a campaign. Live suppression and conversion evidence is READ so the
 * cohort is checked against reality; every write path is deliberately absent from this file.
 *
 * Two outputs, because the packet contains real personal contact data:
 *
 *   packet.json    full detail, for local review only — DO NOT commit or paste into an issue
 *   packet.md      redacted summary (counts, hashes, masked addresses) safe to attach to #354
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { createServiceRoleClient } from '../lib/supabase/service-role';
import {
  MONTREAL_PUBLISHED_SEGMENT,
  OUT_OF_SCOPE_PUBLISHED_SEGMENT,
  QUEBEC_OTHER_PUBLISHED_SEGMENT,
  UNVERIFIED_QUARANTINE_SEGMENT,
  loadExistingContacts,
  loadSuppressionEvidence,
  planContactIntake,
  type ContactSourceClass,
  type IntakeSourceFile,
} from '../lib/server/agency-contact-intake';
import {
  selectCampaignAudience,
  type AudienceCandidate,
  type AudienceEvidence,
} from '../lib/server/campaign-audience';
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
import { allStepContent, createDraftContract, type EmailCampaignV1 } from '../lib/server/email-campaign-contract';
import { resolveCampaignSender, resolveTestRecipients } from '../lib/server/email-campaign-sender';
import { renderCampaignPreview, type PreviewContact } from '../lib/server/email-campaign-preview';
import { DEFAULT_PROVIDER_CAPS, evaluateSchedule, evaluateVolume } from '../lib/server/email-campaign-preflight';

const BUNDLE_FILES: ReadonlyArray<{ file: string; sourceClass: ContactSourceClass }> = [
  { file: '1-VERIFIED-published-327.csv', sourceClass: 'verified_published' },
  { file: '2-CONSTRUCTED-unverified-443.csv', sourceClass: 'constructed_unverified' },
  { file: '3-remaining-names-and-rejections.csv', sourceClass: 'rejection_evidence' },
];

function argValue(flag: string): string | null {
  const args = process.argv.slice(2);
  const index = args.indexOf(flag);
  if (index >= 0 && args[index + 1]) return args[index + 1] as string;
  const inline = args.find((arg) => arg.startsWith(`${flag}=`));
  return inline ? inline.slice(flag.length + 1) : null;
}

/** `ann@royco.ca` → `a**@royco.ca`. Enough to verify a cohort without publishing an address. */
function mask(email: string): string {
  const at = email.indexOf('@');
  const local = email.slice(0, at);
  return `${local.slice(0, 1)}${'*'.repeat(Math.max(2, local.length - 1))}${email.slice(at)}`;
}

function loadBundle(dir: string): IntakeSourceFile[] {
  const files: IntakeSourceFile[] = [];
  for (const entry of BUNDLE_FILES) {
    const path = join(dir, entry.file);
    if (!existsSync(path)) throw new Error(`missing bundle file: ${path}`);
    const text = readFileSync(path, 'utf8');
    files.push({ path, name: entry.file, sha256: createHash('sha256').update(text).digest('hex'), text, sourceClass: entry.sourceClass });
  }
  const supersededDir = join(dir, 'superseded');
  if (existsSync(supersededDir)) {
    for (const name of readdirSync(supersededDir).filter((file) => file.toLowerCase().endsWith('.csv'))) {
      const text = readFileSync(join(supersededDir, name), 'utf8');
      files.push({
        path: join(supersededDir, name),
        name: `superseded/${basename(name)}`,
        sha256: createHash('sha256').update(text).digest('hex'),
        text,
        sourceClass: 'rejection_evidence',
      });
    }
  }
  return files;
}

async function main(): Promise<void> {
  const dir = argValue('--dir');
  const out = argValue('--out') ?? '.';
  if (!dir) throw new Error('usage: --dir "<agency-outreach-list directory>" [--out <directory>]');

  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (read-only use)');
  const supabase = createServiceRoleClient(url, key);

  // ── 1. Source files ──────────────────────────────────────────────────────────
  const files = loadBundle(dir);

  // ── 2. Dry-run intake against LIVE suppression evidence ──────────────────────
  const [existing, suppression] = await Promise.all([
    loadExistingContacts(supabase),
    loadSuppressionEvidence(supabase),
  ]);
  const plan = planContactIntake({ files, existing, suppression });

  // ── 3. Pilot cohort, selected from what the apply WOULD write ────────────────
  // The bank has not been written yet, so the candidates are the planned Montreal writes. This is
  // the same selection function the console uses, so the cohort here is the cohort it would
  // freeze — not a separate approximation.
  const candidates: AudienceCandidate[] = plan.planned
    .map((item) => item.write)
    .filter((write): write is NonNullable<typeof write> => write !== null && write.segment === AGENCY_REPORTING_PILOT_SEGMENT)
    .map((write) => ({
      // Deterministic placeholder ids: nothing has been inserted, so no real id exists yet.
      // Hashed rather than the address itself — the id ends up in preview URLs, and an address
      // in a URL is the easiest way to leak PII into an artifact someone pastes into an issue.
      contactId: `planned-${createHash('sha256').update(write.email).digest('hex').slice(0, 12)}`,
      email: write.email,
      name: write.name,
      company: write.company,
      contactTitle: write.contactTitle,
      segment: write.segment,
      eligibilityStatus: write.eligibilityStatus,
    }));

  const evidence: AudienceEvidence = {
    unsubscribedEmails: suppression.unsubscribedEmails,
    convertedEmails: suppression.convertedEmails,
    suppressedEmails: new Set(),
    activeSequenceEmails: new Set(
      ((await supabase.from('outreach_prospects').select('email,enabled,lifecycle_status').limit(5000)).data ?? [])
        .filter((row: any) => row.enabled && (row.lifecycle_status === 'active' || row.lifecycle_status === 'paused'))
        .map((row: any) => String(row.email).toLowerCase()),
    ),
    enrolledContactIds: new Set(),
  };

  const selection = selectCampaignAudience({ candidates, evidence, limit: AGENCY_REPORTING_PILOT_RECIPIENTS });

  // ── 4. The campaign, in memory only ──────────────────────────────────────────
  const env = process.env as unknown as Record<string, string | undefined>;
  const sender = resolveCampaignSender(env);
  const contract: EmailCampaignV1 = {
    ...createDraftContract({
      campaignId: AGENCY_CHALLENGER_CAMPAIGN_ID,
      interventionId: 'not-created-locally',
      interventionKey: AGENCY_REPORTING_PILOT_KEY,
      goal: AGENCY_REPORTING_PILOT_GOAL,
      sender,
      segment: AGENCY_REPORTING_PILOT_SEGMENT,
      content: AGENCY_REPORTING_PILOT_CONTENT,
      tracking: AGENCY_REPORTING_PILOT_TRACKING,
      schedule: AGENCY_REPORTING_PILOT_SCHEDULE,
    }),
    audience: {
      segment: AGENCY_REPORTING_PILOT_SEGMENT,
      audienceId: 'not-frozen-locally',
      checksum: selection.checksum,
      recipientCount: selection.members.length,
      frozenAt: null,
      excludedCounts: selection.excludedCounts as Record<string, number>,
    },
  };

  // ── 5. Render every message as representative contacts ───────────────────────
  const byEmail = new Map(candidates.map((candidate) => [candidate.email, candidate]));
  const representatives = selection.members.slice(0, 3).map((member) => byEmail.get(member.email)!);
  const rendered = representatives.flatMap((candidate) => {
    const contact: PreviewContact = {
      contactId: candidate.contactId,
      email: candidate.email,
      name: candidate.name,
      company: candidate.company,
      companyDomain: candidate.email.slice(candidate.email.indexOf('@') + 1),
      personalizationReason: null,
      personalizationSourceUrl: null,
    };
    return allStepContent(contract.content).map((_step, index) => {
      const preview = renderCampaignPreview({
        contract,
        contact,
        appUrl: env['NEXT_PUBLIC_APP_URL'] ?? 'https://getgeopulse.com',
        sequenceStep: index + 1,
      });
      return {
        contact: mask(candidate.email),
        sequenceStep: index + 1,
        subject: preview.subject,
        previewText: preview.previewText,
        senderLine: preview.senderLine,
        replyToLine: preview.replyToLine,
        links: preview.links,
        unresolved: preview.unresolved,
        html: preview.html,
      };
    });
  });

  // ── 6. What the preflight says today ─────────────────────────────────────────
  const scheduleGate = evaluateSchedule(
    { ...contract, schedule: { ...contract.schedule, startAt: '2026-08-17T13:00:00.000Z' } },
    Date.now(),
  );
  const volumeGate = evaluateVolume(contract);

  const packet = {
    generatedAt: new Date().toISOString(),
    mode: 'local_acceptance_dry_run',
    held: [
      'no contact-bank write (apply was not run)',
      'no prospect created, no enrollment, no campaign activation',
      'no external email and no internal test (sender is unauthenticated)',
      'no DNS or provider configuration change',
      'no migration applied and no deployment',
      ...(selection.members.length < AGENCY_REPORTING_PILOT_RECIPIENTS
        ? ['pilot launch held: fewer than 25 contacts have auditable public-source evidence']
        : []),
    ],
    sourceFiles: files.map((file) => ({ name: file.name, sha256: file.sha256, sourceClass: file.sourceClass })),
    liveEvidenceRead: {
      existingContacts: existing.length,
      unsubscribedEmails: suppression.unsubscribedEmails.size,
      convertedEmails: suppression.convertedEmails.size,
      activeSequenceEmails: evidence.activeSequenceEmails.size,
    },
    intake: {
      counts: plan.counts,
      plannedWrites: plan.planned.filter((item) => item.write).length,
      segmentCounts: plan.segmentCounts,
      eligibilityCounts: plan.eligibilityCounts,
      malformed: plan.malformed,
      evidenceOnly: plan.evidenceOnly,
      segments: {
        montreal: MONTREAL_PUBLISHED_SEGMENT,
        quebecOther: QUEBEC_OTHER_PUBLISHED_SEGMENT,
        quarantine: UNVERIFIED_QUARANTINE_SEGMENT,
        outOfScope: OUT_OF_SCOPE_PUBLISHED_SEGMENT,
      },
    },
    pilot: {
      interventionKey: AGENCY_REPORTING_PILOT_KEY,
      campaignId: AGENCY_CHALLENGER_CAMPAIGN_ID,
      segment: AGENCY_REPORTING_PILOT_SEGMENT,
      candidatesInSegment: candidates.length,
      cohortSize: selection.members.length,
      launchReady: selection.members.length === AGENCY_REPORTING_PILOT_RECIPIENTS,
      launchBlocker: selection.members.length === AGENCY_REPORTING_PILOT_RECIPIENTS
        ? null
        : 'fewer_than_25_contacts_with_auditable_public_source',
      checksum: selection.checksum,
      excludedCounts: selection.excludedCounts,
      cohort: selection.members.map((member) => ({ position: member.position, email: member.email })),
      cohortMasked: selection.members.map((member) => ({ position: member.position, email: mask(member.email) })),
      goal: AGENCY_REPORTING_PILOT_GOAL,
      tracking: AGENCY_REPORTING_PILOT_TRACKING,
      schedule: AGENCY_REPORTING_PILOT_SCHEDULE,
      senderState: { authenticated: sender.authenticated, blockingReason: sender.blockingReason },
      testRecipients: resolveTestRecipients(env),
      expectedSpendUsd: Number(
        (selection.members.length * AGENCY_REPORTING_PILOT_SCHEDULE.maxSequenceSteps * DEFAULT_PROVIDER_CAPS.estimatedCostPerSendUsd).toFixed(3),
      ),
      gates: { schedule: scheduleGate, volume: volumeGate },
    },
    renderedMessages: rendered,
  };

  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'packet.json'), `${JSON.stringify(packet, null, 2)}\n`, 'utf8');

  const redacted = {
    ...packet,
    pilot: { ...packet.pilot, cohort: '[redacted — see packet.json locally]' },
    renderedMessages: rendered.map((message) => ({ ...message, html: `[${String(message.html.length)} bytes]` })),
  };
  writeFileSync(join(out, 'packet-redacted.json'), `${JSON.stringify(redacted, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify(redacted, null, 2));
  console.log(`\nWrote ${join(out, 'packet.json')} (contains contact PII — local review only)`);
  console.log(`Wrote ${join(out, 'packet-redacted.json')} (safe to attach to the issue)`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
