/**
 * Agency contact intake CLI (VCI-8 / ECP-1).
 *
 *   npm run contacts:intake -- --dir "C:\path\to\agency-outreach-list"
 *   npm run contacts:intake -- --dir "..." --apply --confirm=ECP-1
 *
 * The default is a DRY RUN: it reads the bundle, resolves every row against live suppression and
 * conversion evidence, and prints the exact counts — without writing anything. `--apply` writes
 * the same plan it just printed, so the numbers an operator reviewed are the numbers that land.
 *
 * `--json <path>` writes the reconciliation packet (file hashes + counts) used as ECP-5 evidence.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { createServiceRoleClient } from '../lib/supabase/service-role';
import { resolveDatabaseTarget } from '../lib/server/database-target';
import {
  applyContactIntake,
  loadExistingContacts,
  loadSuppressionEvidence,
  planContactIntake,
  type ContactSourceClass,
  type IntakeSourceFile,
} from '../lib/server/agency-contact-intake';

const APPLY_CONFIRMATION = '--confirm=ECP-1';
const ALLOW_PRODUCTION = '--allow-production';


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

function hasFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

function loadBundle(dir: string): IntakeSourceFile[] {
  const files: IntakeSourceFile[] = [];
  for (const entry of BUNDLE_FILES) {
    const path = join(dir, entry.file);
    if (!existsSync(path)) throw new Error(`missing bundle file: ${path}`);
    const text = readFileSync(path, 'utf8');
    files.push({
      path,
      name: entry.file,
      sha256: createHash('sha256').update(text).digest('hex'),
      text,
      sourceClass: entry.sourceClass,
    });
  }

  // Superseded exports are earlier snapshots of the same people. They are hashed and counted as
  // provenance, never imported: an older export cannot re-establish an address the current files
  // already rejected or suppressed.
  const supersededDir = join(dir, 'superseded');
  if (existsSync(supersededDir)) {
    for (const name of readdirSync(supersededDir).filter((file) => file.toLowerCase().endsWith('.csv'))) {
      const path = join(supersededDir, name);
      const text = readFileSync(path, 'utf8');
      files.push({
        path,
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
  if (!dir) throw new Error('usage: --dir "<agency-outreach-list directory>" [--apply --confirm=ECP-1] [--json <path>]');

  const apply = hasFlag('--apply');
  if (apply && !hasFlag(APPLY_CONFIRMATION)) {
    throw new Error(`--apply requires ${APPLY_CONFIRMATION}`);
  }

  const files = loadBundle(dir);
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const key = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');

  const target = resolveDatabaseTarget(url);
  if (apply && !target.isLocal && !hasFlag(ALLOW_PRODUCTION)) {
    throw new Error(
      `refusing to --apply against non-local database ${target.host}. `
      + `VCI-8 holds production contact writes until QA; pass ${ALLOW_PRODUCTION} to override deliberately.`,
    );
  }
  // Printed before any write, so the operator sees which database they are about to change.
  console.error(`[intake] target ${target.host} (${target.isLocal ? 'local' : 'REMOTE'}) · mode ${apply ? 'APPLY' : 'dry run'}`);

  const supabase = createServiceRoleClient(url, key);
  const [existing, suppression] = await Promise.all([
    loadExistingContacts(supabase),
    loadSuppressionEvidence(supabase),
  ]);

  const plan = planContactIntake({ files, existing, suppression });

  const packet = {
    generatedAt: new Date().toISOString(),
    mode: apply ? 'apply' : 'dry_run',
    sourceFiles: files.map((file) => ({ name: file.name, sha256: file.sha256, sourceClass: file.sourceClass })),
    existingContacts: existing.length,
    suppressionEvidence: {
      unsubscribed: suppression.unsubscribedEmails.size,
      converted: suppression.convertedEmails.size,
    },
    counts: plan.counts,
    segmentCounts: plan.segmentCounts,
    eligibilityCounts: plan.eligibilityCounts,
    malformed: plan.malformed,
    evidenceOnly: plan.evidenceOnly,
    plannedWrites: plan.planned.filter((item) => item.write).length,
    applied: null as null | { written: number; failed: number; errors: string[] },
  };

  if (apply) {
    packet.applied = await applyContactIntake(supabase, plan);
  }

  const jsonPath = argValue('--json');
  if (jsonPath) writeFileSync(jsonPath, `${JSON.stringify(packet, null, 2)}\n`, 'utf8');

  console.log(JSON.stringify(packet, null, 2));
  if (!apply) {
    console.log('\nDRY RUN — no rows were written. Re-run with --apply --confirm=ECP-1 to write this exact plan.');
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
