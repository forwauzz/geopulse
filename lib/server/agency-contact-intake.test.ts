import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MONTREAL_PUBLISHED_SEGMENT,
  OUT_OF_SCOPE_PUBLISHED_SEGMENT,
  QUEBEC_OTHER_PUBLISHED_SEGMENT,
  UNVERIFIED_QUARANTINE_SEGMENT,
  applyContactIntake,
  classifyEligibility,
  classifyRegion,
  isFreeMailDomain,
  isRoleBasedEmail,
  mergeContactEvidence,
  normalizeEmail,
  parseCsv,
  planContactIntake,
  segmentFor,
  type ContactSuppressionEvidence,
  type ExistingContactState,
  type IntakeSourceFile,
} from './agency-contact-intake';

const NO_SUPPRESSION: ContactSuppressionEvidence = {
  unsubscribedEmails: new Set(),
  convertedEmails: new Set(),
};

function verifiedFile(rows: string, name = '1-VERIFIED-published-327.csv'): IntakeSourceFile {
  return {
    path: `/bundle/${name}`,
    name,
    sha256: 'sha-verified',
    sourceClass: 'verified_published',
    text: `name,title,company,email,region\n${rows}`,
  };
}

function constructedFile(rows: string): IntakeSourceFile {
  return {
    path: '/bundle/2-CONSTRUCTED-unverified-443.csv',
    name: '2-CONSTRUCTED-unverified-443.csv',
    sha256: 'sha-constructed',
    sourceClass: 'constructed_unverified',
    text: `name,title,company,constructed_email,region,confidence,basis\n${rows}`,
  };
}

describe('CSV parsing', () => {
  it('keeps commas inside quoted fields from shifting later columns', () => {
    const { header, rows } = parseCsv(
      'name,title,company,constructed_email,region,confidence,basis\n' +
        'Ann Roy,CEO,"Roy, Roy & Co",ann@royco.ca,Montreal,B-MED,"domain confirmed, first@ pattern (62%)"\n',
    );
    expect(header).toEqual(['name', 'title', 'company', 'constructed_email', 'region', 'confidence', 'basis']);
    expect(rows[0]?.values[2]).toBe('Roy, Roy & Co');
    expect(rows[0]?.values[4]).toBe('Montreal');
  });

  it('numbers rows the way an operator counts them in a spreadsheet', () => {
    const { rows } = parseCsv('name,email\nA,a@x.ca\nB,b@x.ca\n');
    expect(rows.map((row) => row.row)).toEqual([2, 3]);
  });

  it('unescapes doubled quotes and ignores blank lines', () => {
    const { rows } = parseCsv('name,company\n\nAnn,"The ""Big"" Shop"\n');
    expect(rows).toHaveLength(1);
    expect(rows[0]?.values[1]).toBe('The "Big" Shop');
  });
});

describe('normalization', () => {
  it('lowercases and validates addresses', () => {
    expect(normalizeEmail('  Ann@RoyCo.CA ')).toBe('ann@royco.ca');
    expect(normalizeEmail('not-an-email')).toBeNull();
    expect(normalizeEmail('')).toBeNull();
  });

  it('recognizes role mailboxes and free-mail domains', () => {
    expect(isRoleBasedEmail('info@royco.ca')).toBe(true);
    expect(isRoleBasedEmail('new.business@royco.ca')).toBe(true);
    expect(isRoleBasedEmail('ann@royco.ca')).toBe(false);
    expect(isFreeMailDomain('ann@gmail.com')).toBe(true);
    expect(isFreeMailDomain('ann@royco.ca')).toBe(false);
  });

  it('maps regions to the approved Quebec scopes', () => {
    expect(classifyRegion('Montreal')).toBe('qc_montreal');
    expect(classifyRegion('Québec')).toBe('qc_other');
    expect(classifyRegion('Toronto')).toBe('out_of_scope');
    expect(classifyRegion(null)).toBe('out_of_scope');
  });

  it('routes every source class to its own segment', () => {
    expect(segmentFor('verified_published', 'Montreal')).toBe(MONTREAL_PUBLISHED_SEGMENT);
    expect(segmentFor('verified_published', 'Quebec')).toBe(QUEBEC_OTHER_PUBLISHED_SEGMENT);
    expect(segmentFor('verified_published', 'Toronto')).toBe(OUT_OF_SCOPE_PUBLISHED_SEGMENT);
    // A constructed Montreal address is quarantined by provenance, not placed by geography.
    expect(segmentFor('constructed_unverified', 'Montreal')).toBe(UNVERIFIED_QUARANTINE_SEGMENT);
  });
});

describe('eligibility is fail-closed', () => {
  it('marks a published Montreal decision-maker eligible', () => {
    expect(
      classifyEligibility({ email: 'ann@royco.ca', sourceClass: 'verified_published', region: 'Montreal', suppression: NO_SUPPRESSION }),
    ).toEqual({ status: 'eligible', reason: 'published_address_in_approved_geography' });
  });

  it('never lets a constructed address become sendable, even in geography', () => {
    const result = classifyEligibility({
      email: 'ann@royco.ca',
      sourceClass: 'constructed_unverified',
      region: 'Montreal',
      suppression: NO_SUPPRESSION,
    });
    expect(result.status).toBe('needs_verification');
    expect(result.reason).toBe('constructed_address_no_consent_basis');
  });

  it('keeps rejection evidence permanently unsendable', () => {
    expect(
      classifyEligibility({ email: 'ann@royco.ca', sourceClass: 'rejection_evidence', region: 'Montreal', suppression: NO_SUPPRESSION }).status,
    ).toBe('rejected');
  });

  it('suppression and conversion outrank perfect provenance', () => {
    const suppression: ContactSuppressionEvidence = {
      unsubscribedEmails: new Set(['gone@royco.ca']),
      convertedEmails: new Set(['customer@royco.ca']),
      operatorSuppressedEmails: new Set(['blocked@royco.ca']),
    };
    expect(classifyEligibility({ email: 'gone@royco.ca', sourceClass: 'verified_published', region: 'Montreal', suppression }).status).toBe('suppressed');
    expect(classifyEligibility({ email: 'customer@royco.ca', sourceClass: 'verified_published', region: 'Montreal', suppression }).status).toBe('converted');
    expect(classifyEligibility({ email: 'blocked@royco.ca', sourceClass: 'verified_published', region: 'Montreal', suppression }).status).toBe('suppressed');
  });

  it('quarantines role and free-mail addresses and rejects out-of-geography ones', () => {
    expect(classifyEligibility({ email: 'info@royco.ca', sourceClass: 'verified_published', region: 'Montreal', suppression: NO_SUPPRESSION }).reason).toBe('role_based_address');
    expect(classifyEligibility({ email: 'ann@gmail.com', sourceClass: 'verified_published', region: 'Montreal', suppression: NO_SUPPRESSION }).reason).toBe('free_mail_domain');
    const outOfScope = classifyEligibility({ email: 'ann@royco.ca', sourceClass: 'verified_published', region: 'Toronto', suppression: NO_SUPPRESSION });
    expect(outOfScope.status).toBe('rejected');
    expect(outOfScope.reason).toBe('outside_approved_geography:toronto');
  });
});

describe('merging never erases stronger evidence', () => {
  const existingVerified: ExistingContactState = {
    id: 'c1',
    email: 'ann@royco.ca',
    segment: MONTREAL_PUBLISHED_SEGMENT,
    sourceClass: 'verified_published',
    eligibilityStatus: 'eligible',
    eligibilityReason: 'published_address_in_approved_geography',
    addedToSequenceAt: null,
  };

  it('a constructed re-import cannot downgrade a published contact', () => {
    const merged = mergeContactEvidence(existingVerified, {
      sourceClass: 'constructed_unverified',
      eligibilityStatus: 'needs_verification',
      eligibilityReason: 'constructed_address_no_consent_basis',
      segment: UNVERIFIED_QUARANTINE_SEGMENT,
    });
    expect(merged.sourceClass).toBe('verified_published');
    expect(merged.eligibilityStatus).toBe('eligible');
    expect(merged.segment).toBe(MONTREAL_PUBLISHED_SEGMENT);
  });

  it('a published re-import cannot resurrect an unsubscribed contact', () => {
    const merged = mergeContactEvidence(
      { ...existingVerified, eligibilityStatus: 'suppressed', eligibilityReason: 'unsubscribed' },
      {
        sourceClass: 'verified_published',
        eligibilityStatus: 'eligible',
        eligibilityReason: 'published_address_in_approved_geography',
        segment: MONTREAL_PUBLISHED_SEGMENT,
      },
    );
    expect(merged.eligibilityStatus).toBe('suppressed');
    expect(merged.eligibilityReason).toBe('unsubscribed');
  });

  it('upgrades provenance when the published file confirms a previously constructed address', () => {
    const merged = mergeContactEvidence(
      { ...existingVerified, sourceClass: 'constructed_unverified', eligibilityStatus: 'needs_verification', eligibilityReason: 'constructed_address_no_consent_basis', segment: UNVERIFIED_QUARANTINE_SEGMENT },
      {
        sourceClass: 'verified_published',
        eligibilityStatus: 'eligible',
        eligibilityReason: 'published_address_in_approved_geography',
        segment: MONTREAL_PUBLISHED_SEGMENT,
      },
    );
    expect(merged.sourceClass).toBe('verified_published');
    expect(merged.eligibilityStatus).toBe('eligible');
    expect(merged.segment).toBe(MONTREAL_PUBLISHED_SEGMENT);
  });
});

describe('intake plan (the dry run)', () => {
  const files = [
    verifiedFile(
      [
        'Ann Roy,CEO,Roy Co,ann@royco.ca,Montreal',
        'Ben Roy,Founder,Ben Co,ben@benco.ca,Quebec',
        'Cara Lu,Owner,Cara Co,cara@caraco.ca,Toronto',
        'Info Desk,Team,Roy Co,info@royco.ca,Montreal',
        'Gone Away,Owner,Gone Co,gone@goneco.ca,Montreal',
        'Paying Customer,Owner,Pay Co,customer@payco.ca,Montreal',
        'Bad Row,Owner,Broken Co,not-an-email,Montreal',
        'No Company,Owner,,nocompany@x.ca,Montreal',
        'Ann Roy,CEO,Roy Co,ANN@royco.ca,Montreal',
      ].join('\n'),
    ),
    constructedFile(
      [
        'Dana Fox,CEO,Fox Co,dana@foxco.ca,Montreal,B-MED,"domain confirmed, first@ pattern (62%)"',
        'Ann Roy,CEO,Roy Co,ann@royco.ca,Montreal,B-MED,"domain confirmed, first@ pattern (62%)"',
      ].join('\n'),
    ),
    {
      path: '/bundle/3-remaining-names-and-rejections.csv',
      name: '3-remaining-names-and-rejections.csv',
      sha256: 'sha-rejections',
      sourceClass: 'rejection_evidence' as const,
      text: 'name,title,company,region,apollo_email_status,note\nEve Nil,Founder,Nil Co,Montreal,available,needs credit or construct\n',
    },
  ];

  const suppression: ContactSuppressionEvidence = {
    unsubscribedEmails: new Set(['gone@goneco.ca']),
    convertedEmails: new Set(['customer@payco.ca']),
  };

  const plan = planContactIntake({ files, existing: [], suppression });
  const byEmail = (email: string) => plan.planned.filter((item) => item.email === email);

  it('reports every required count bucket', () => {
    expect(plan.counts).toEqual({
      inserted: 2, // ann@royco.ca, ben@benco.ca
      merged: 0,
      duplicate: 2, // the repeated ANN@royco.ca row and the constructed duplicate of it
      quarantined: 2, // info@royco.ca (role) and dana@foxco.ca (constructed)
      suppressed: 2, // unsubscribed + converted
      rejected: 3, // cara@caraco.ca out of geography + two malformed rows
    });
  });

  it('never writes rejection evidence or malformed rows into the bank', () => {
    expect(plan.evidenceOnly).toEqual([
      { sourceFile: '3-remaining-names-and-rejections.csv', rows: 1, reason: 'rejection_or_superseded_evidence_not_importable' },
    ]);
    expect(plan.malformed).toEqual([
      { sourceFile: '1-VERIFIED-published-327.csv', row: 8, reason: 'invalid_email' },
      { sourceFile: '1-VERIFIED-published-327.csv', row: 9, reason: 'missing_company' },
    ]);
    expect(plan.planned.some((item) => item.email === 'eve@nilco.ca')).toBe(false);
  });

  it('keeps the constructed file from touching an address the published file already proved', () => {
    const constructedRow = byEmail('ann@royco.ca').find((item) => item.sourceFile.startsWith('2-'));
    expect(constructedRow?.decision).toBe('duplicate');
    expect(constructedRow?.write).toBeNull();
    expect(plan.eligibilityCounts.eligible).toBe(2);
  });

  it('derives a company URL from the address instead of inventing a website', () => {
    const write = byEmail('ann@royco.ca')[0]?.write;
    expect(write?.url).toBe('https://royco.ca');
    expect(write?.companyDomain).toBe('royco.ca');
    expect(write?.provenance).toMatchObject({
      url_basis: 'derived_from_email_domain',
      source_file: '1-VERIFIED-published-327.csv',
      source_file_sha256: 'sha-verified',
      source_row: 2,
    });
  });

  it('places contacts in the three saved segments plus the out-of-scope evidence segment', () => {
    expect(plan.segmentCounts).toEqual({
      [MONTREAL_PUBLISHED_SEGMENT]: 4, // ann, info, gone, customer
      [QUEBEC_OTHER_PUBLISHED_SEGMENT]: 1,
      [OUT_OF_SCOPE_PUBLISHED_SEGMENT]: 1,
      [UNVERIFIED_QUARANTINE_SEGMENT]: 1,
    });
  });

  it('is deterministic: the same inputs produce the same counts', () => {
    const again = planContactIntake({ files, existing: [], suppression });
    expect(again.counts).toEqual(plan.counts);
    expect(again.planned.map((item) => `${item.email}:${item.decision}`)).toEqual(
      plan.planned.map((item) => `${item.email}:${item.decision}`),
    );
  });

  it('a second apply is a no-op: every unchanged row becomes a duplicate with no write', () => {
    const existing: ExistingContactState[] = plan.planned
      .filter((item) => item.write)
      .map((item, index) => ({
        id: `c${String(index)}`,
        email: item.email,
        segment: item.write!.segment,
        sourceClass: item.write!.sourceClass,
        eligibilityStatus: item.write!.eligibilityStatus,
        eligibilityReason: item.write!.eligibilityReason,
        addedToSequenceAt: null,
      }));
    const rerun = planContactIntake({ files, existing, suppression });
    expect(rerun.planned.every((item) => item.write === null)).toBe(true);
    expect(rerun.counts.inserted).toBe(0);
    expect(rerun.counts.merged).toBe(0);
  });
});

describe('apply writes only contact-bank state', () => {
  it('upserts on email and never touches prospects or sends mail', async () => {
    const calls: { table: string; rows: Record<string, unknown>[]; onConflict?: string }[] = [];
    const supabase = {
      from(table: string) {
        return {
          upsert(rows: Record<string, unknown>[], options?: { onConflict?: string }) {
            calls.push({ table, rows, onConflict: options?.onConflict });
            return Promise.resolve({ error: null });
          },
        };
      },
    } as never;

    const plan = planContactIntake({
      files: [verifiedFile('Ann Roy,CEO,Roy Co,ann@royco.ca,Montreal')],
      existing: [],
      suppression: NO_SUPPRESSION,
    });
    const result = await applyContactIntake(supabase, plan, '2026-08-02T00:00:00.000Z');

    expect(result).toEqual({ written: 1, failed: 0, errors: [] });
    expect(calls.map((call) => call.table)).toEqual(['outreach_contacts']);
    expect(calls[0]?.onConflict).toBe('email');
    expect(calls[0]?.rows[0]).toMatchObject({
      email: 'ann@royco.ca',
      eligibility_status: 'eligible',
      source_class: 'verified_published',
      segment: MONTREAL_PUBLISHED_SEGMENT,
    });
    // No prospect row, no enrollment, no send: import can never start a sequence.
    expect(calls.some((call) => call.table !== 'outreach_contacts')).toBe(false);
  });
});

describe('migration 079', () => {
  const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/079_email_campaign_control_room.sql'), 'utf8');

  it('defaults eligibility to the restrictive value', () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS eligibility_status TEXT NOT NULL DEFAULT 'needs_verification'");
  });

  it('creates the immutable audience and enrollment ledgers as service-role only', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.outreach_campaign_audiences');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.outreach_campaign_audience_members');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.outreach_campaign_enrollments');
    expect(migration).toContain('idempotency_key  TEXT        NOT NULL UNIQUE');
    expect(migration).toContain('UNIQUE (audience_id, contact_id)');
    for (const table of ['outreach_campaign_audiences', 'outreach_campaign_audience_members', 'outreach_campaign_enrollments']) {
      expect(migration).toMatch(new RegExp(`ALTER TABLE public\\.${table}\\s+ENABLE ROW LEVEL SECURITY`));
      expect(migration).toMatch(new RegExp(`ON TABLE public\\.${table} TO service_role`));
    }
    expect(migration).not.toMatch(/CREATE POLICY/);
  });

  it('protects frozen audiences from contact deletion', () => {
    expect(migration).toContain('REFERENCES public.outreach_contacts(id) ON DELETE RESTRICT');
  });
});
