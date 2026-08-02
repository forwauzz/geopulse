import { describe, expect, it } from 'vitest';
import {
  audienceChecksum,
  contactStrengthScore,
  enrollmentIdempotencyKey,
  freezeCampaignAudience,
  selectCampaignAudience,
  type AudienceCandidate,
  type AudienceEvidence,
} from './campaign-audience';

const NO_EVIDENCE: AudienceEvidence = {
  unsubscribedEmails: new Set(),
  convertedEmails: new Set(),
  suppressedEmails: new Set(),
  activeSequenceEmails: new Set(),
  enrolledContactIds: new Set(),
};

function candidate(overrides: Partial<AudienceCandidate> & { contactId: string; email: string }): AudienceCandidate {
  return {
    name: 'Ann Roy',
    company: 'Roy Co',
    contactTitle: 'Owner',
    segment: 'agency-ca-qc-montreal-published-2026-08',
    eligibilityStatus: 'eligible',
    ...overrides,
  };
}

describe('cohort strength ranking', () => {
  it('prefers a named decision-maker over a bare address', () => {
    const named = candidate({ contactId: 'a', email: 'ann@royco.ca' });
    const bare = candidate({ contactId: 'b', email: 'x1@royco.ca', name: null, contactTitle: 'Intern', company: null });
    expect(contactStrengthScore(named)).toBeGreaterThan(contactStrengthScore(bare));
  });

  it('breaks ties deterministically so the same inputs freeze the same cohort', () => {
    const candidates = [
      candidate({ contactId: 'b', email: 'bea@royco.ca' }),
      candidate({ contactId: 'a', email: 'ann@royco.ca' }),
    ];
    const first = selectCampaignAudience({ candidates, evidence: NO_EVIDENCE, limit: 2 });
    const second = selectCampaignAudience({ candidates: [...candidates].reverse(), evidence: NO_EVIDENCE, limit: 2 });
    expect(first.members.map((member) => member.email)).toEqual(['ann@royco.ca', 'bea@royco.ca']);
    expect(second.checksum).toBe(first.checksum);
  });
});

describe('audience selection excludes every unsafe contact with a named reason', () => {
  const candidates = [
    candidate({ contactId: 'ok', email: 'ann@royco.ca' }),
    candidate({ contactId: 'quarantined', email: 'dana@foxco.ca', eligibilityStatus: 'needs_verification' }),
    candidate({ contactId: 'rejected', email: 'cara@caraco.ca', eligibilityStatus: 'rejected' }),
    candidate({ contactId: 'gone', email: 'gone@goneco.ca' }),
    candidate({ contactId: 'customer', email: 'customer@payco.ca' }),
    candidate({ contactId: 'blocked', email: 'blocked@royco.ca' }),
    candidate({ contactId: 'busy', email: 'busy@royco.ca' }),
    candidate({ contactId: 'enrolled', email: 'enrolled@royco.ca' }),
  ];

  const evidence: AudienceEvidence = {
    unsubscribedEmails: new Set(['gone@goneco.ca']),
    convertedEmails: new Set(['customer@payco.ca']),
    suppressedEmails: new Set(['blocked@royco.ca']),
    activeSequenceEmails: new Set(['busy@royco.ca']),
    enrolledContactIds: new Set(['enrolled']),
  };

  const selection = selectCampaignAudience({ candidates, evidence, limit: 25 });

  it('locks only the safe contact', () => {
    expect(selection.members.map((member) => member.contactId)).toEqual(['ok']);
  });

  it('counts each exclusion reason for the operator', () => {
    expect(selection.excludedCounts).toEqual({
      not_eligible: 2,
      unsubscribed: 1,
      converted: 1,
      suppressed: 1,
      conflicting_active_sequence: 1,
      already_enrolled: 1,
    });
  });
});

describe('recipient cap', () => {
  const candidates = Array.from({ length: 40 }, (_, index) =>
    candidate({ contactId: `c${String(index).padStart(2, '0')}`, email: `owner${String(index).padStart(2, '0')}@royco.ca` }),
  );

  it('freezes exactly the cap and reports the overflow', () => {
    const selection = selectCampaignAudience({ candidates, evidence: NO_EVIDENCE, limit: 25 });
    expect(selection.members).toHaveLength(25);
    expect(selection.members.at(-1)?.position).toBe(25);
    expect(selection.excludedCounts.over_recipient_cap).toBe(15);
  });
});

describe('a frozen cohort cannot drift when its source segment changes', () => {
  const original = Array.from({ length: 25 }, (_, index) =>
    candidate({ contactId: `c${String(index).padStart(2, '0')}`, email: `owner${String(index).padStart(2, '0')}@royco.ca` }),
  );
  const frozen = selectCampaignAudience({ candidates: original, evidence: NO_EVIDENCE, limit: 25 });

  it('a later import into the same segment does not change the frozen checksum', () => {
    const widened = [...original, candidate({ contactId: 'new', email: 'aaa-newcomer@royco.ca' })];
    const reselected = selectCampaignAudience({ candidates: widened, evidence: NO_EVIDENCE, limit: 25 });
    // The live query legitimately changed...
    expect(reselected.checksum).not.toBe(frozen.checksum);
    // ...but the snapshot the operator reviewed is unchanged, and its checksum still recomputes.
    expect(audienceChecksum(frozen.members)).toBe(frozen.checksum);
  });

  it('a member list in a different order is a different audience', () => {
    const shuffled = [...frozen.members].reverse().map((member, index) => ({ ...member, position: index + 1 }));
    expect(audienceChecksum(shuffled)).not.toBe(frozen.checksum);
  });
});

describe('enrollment idempotency key', () => {
  it('binds a contact to one campaign version so a retry cannot duplicate it', () => {
    const key = enrollmentIdempotencyKey({ interventionKey: 'agency-reporting-montreal-v1', campaignVersion: 2, contactId: 'c01' });
    expect(key).toBe('agency-reporting-montreal-v1@v2:c01');
    expect(enrollmentIdempotencyKey({ interventionKey: 'agency-reporting-montreal-v1', campaignVersion: 3, contactId: 'c01' })).not.toBe(key);
  });
});

describe('freezing persistence', () => {
  type Call = { table: string; op: string; payload?: unknown };

  function stubSupabase(options: { existing?: Record<string, unknown> | null; memberError?: string } = {}) {
    const calls: Call[] = [];
    const supabase = {
      from(table: string) {
        return {
          select() {
            return {
              eq() {
                return {
                  maybeSingle: () => Promise.resolve({ data: options.existing ?? null }),
                  order: () => Promise.resolve({ data: [] }),
                };
              },
            };
          },
          insert(payload: unknown) {
            calls.push({ table, op: 'insert', payload });
            if (table === 'outreach_campaign_audience_members') {
              return Promise.resolve({ error: options.memberError ? { message: options.memberError } : null });
            }
            return {
              select: () => ({ single: () => Promise.resolve({ data: { id: 'aud-1' }, error: null }) }),
            };
          },
          delete() {
            calls.push({ table, op: 'delete' });
            return { eq: () => Promise.resolve({ error: null }) };
          },
        };
      },
    } as never;
    return { supabase, calls };
  }

  const selection = selectCampaignAudience({
    candidates: [candidate({ contactId: 'c1', email: 'ann@royco.ca' })],
    evidence: NO_EVIDENCE,
    limit: 25,
  });

  const freezeArgs = {
    campaignId: 'camp-1',
    interventionId: 'int-1',
    interventionKey: 'agency-reporting-montreal-v1',
    campaignVersion: 1,
    sourceSegment: 'agency-ca-qc-montreal-published-2026-08',
    selection,
    selectionReason: '25 strongest eligible Montreal agency decision-makers',
  };

  it('writes the snapshot header and its members', async () => {
    const { supabase, calls } = stubSupabase();
    const result = await freezeCampaignAudience({ supabase, ...freezeArgs });
    expect(result).toMatchObject({ ok: true, created: true });
    expect(calls.map((call) => `${call.table}:${call.op}`)).toEqual([
      'outreach_campaign_audiences:insert',
      'outreach_campaign_audience_members:insert',
    ]);
  });

  it('re-freezing the same version returns the reviewed snapshot instead of replacing it', async () => {
    const { supabase, calls } = stubSupabase({
      existing: { id: 'aud-existing', audience_key: 'agency-reporting-montreal-v1@v1', campaign_version: 1, recipient_count: 25, checksum: 'frozen' },
    });
    const result = await freezeCampaignAudience({ supabase, ...freezeArgs });
    expect(result).toEqual({
      ok: true,
      created: false,
      audience: { id: 'aud-existing', audienceKey: 'agency-reporting-montreal-v1@v1', campaignVersion: 1, recipientCount: 25, checksum: 'frozen' },
    });
    expect(calls).toHaveLength(0);
  });

  it('removes a half-written snapshot rather than leaving an empty approved audience', async () => {
    const { supabase, calls } = stubSupabase({ memberError: 'member insert failed' });
    const result = await freezeCampaignAudience({ supabase, ...freezeArgs });
    expect(result).toEqual({ ok: false, reason: 'member insert failed' });
    expect(calls.at(-1)).toMatchObject({ table: 'outreach_campaign_audiences', op: 'delete' });
  });
});
