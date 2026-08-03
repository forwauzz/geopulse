import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDraftContract, type EmailCampaignV1 } from './email-campaign-contract';
import {
  AGENCY_REPORTING_PILOT_CONTENT,
  AGENCY_REPORTING_PILOT_GOAL,
  AGENCY_REPORTING_PILOT_KEY,
  AGENCY_REPORTING_PILOT_SCHEDULE,
  AGENCY_REPORTING_PILOT_STEPS,
  AGENCY_REPORTING_PILOT_TRACKING,
} from './agency-reporting-pilot';
import { runOutreachForProspect, type OutreachProspect } from './outreach';

const NOW = Date.parse('2026-08-10T13:00:00.000Z');

function lockedContract(): EmailCampaignV1 {
  const draft = createDraftContract({
    campaignId: 'campaign-1',
    interventionId: 'intervention-1',
    interventionKey: AGENCY_REPORTING_PILOT_KEY,
    goal: AGENCY_REPORTING_PILOT_GOAL,
    sender: {
      displayName: 'Elena at GEO-Pulse',
      fromAddressRef: 'GEOPULSE_CAMPAIGN_FROM_EMAIL',
      replyToRef: 'GEOPULSE_CAMPAIGN_REPLY_TO_EMAIL',
      authenticated: true,
      authenticationEvidence: 'verified',
    },
    segment: 'agency-ca-qc-montreal-published-2026-08',
    content: AGENCY_REPORTING_PILOT_CONTENT,
    tracking: AGENCY_REPORTING_PILOT_TRACKING,
    schedule: { ...AGENCY_REPORTING_PILOT_SCHEDULE, startAt: '2026-08-10T13:00:00.000Z' },
    nowIso: '2026-08-03T00:00:00.000Z',
  });
  return {
    ...draft,
    state: 'scheduled',
    audience: {
      segment: draft.audience.segment,
      audienceId: 'audience-1',
      checksum: 'checksum-1',
      recipientCount: 1,
      frozenAt: '2026-08-03T00:00:00.000Z',
      excludedCounts: {},
    },
    governance: {
      ...draft.governance,
      scheduledAt: '2026-08-03T00:00:00.000Z',
      lockedAt: '2026-08-03T00:00:00.000Z',
    },
  };
}

function prospect(sequenceStep: number): OutreachProspect {
  return {
    id: 'prospect-1',
    email: 'ann@royco.ca',
    name: 'Ann Roy',
    company: 'Roy Co',
    url: 'https://royco.ca',
    cadence: 'monthly',
    enabled: true,
    lastRunAt: null,
    nextRunAt: '2026-08-10T13:00:00.000Z',
    lastScanId: null,
    lastError: null,
    templateId: null,
    lifecycleStatus: 'active',
    sequenceStep,
    maxSequenceSteps: 3,
    sequenceDelaysDays: [0, 4, 10],
    consecutiveFailures: 0,
    maxAttempts: 3,
    nextAction: null,
    segment: 'agency-ca-qc-montreal-published-2026-08',
    personalizationReason: null,
    personalizationSourceUrl: null,
    growthCampaignId: 'campaign-1',
    growthInterventionId: 'intervention-1',
  };
}

function stubSupabase(contract: EmailCampaignV1, sequenceStep: number) {
  const writes: Array<{ table: string; op: string; payload: Record<string, unknown> }> = [];
  function query(data: unknown, error: unknown = null): any {
    const builder: any = Promise.resolve({ data, error });
    for (const method of ['eq', 'in', 'order', 'limit', 'select']) builder[method] = () => builder;
    builder.maybeSingle = () => Promise.resolve({ data, error });
    builder.single = () => Promise.resolve({ data, error });
    return builder;
  }
  const supabase = {
    from(table: string) {
      return {
        select() {
          if (table === 'outreach_campaign_enrollments') {
            return query({
              id: 'enrollment-1',
              contact_id: 'contact-1',
              intervention_id: 'intervention-1',
              campaign_version: contract.version,
              status: sequenceStep === 1 ? 'enrolled' : 'sending',
            });
          }
          if (table === 'growth_campaign_interventions') {
            return query({ metadata: { email_campaign: { current: contract.version, versions: { [String(contract.version)]: contract } } } });
          }
          if (table === 'outreach_contacts') {
            return query({
              id: 'contact-1',
              email: 'ann@royco.ca',
              name: 'Ann Roy',
              company: 'Roy Co',
              company_domain: 'royco.ca',
              eligibility_status: 'eligible',
              personalization_reason: null,
              personalization_source_url: 'https://directory.example/ann',
            });
          }
          if (table === 'outreach_sends') return query(null);
          return query(null);
        },
        insert(payload: Record<string, unknown>) {
          writes.push({ table, op: 'insert', payload });
          return query({ id: `send-${String(sequenceStep)}` });
        },
        update(payload: Record<string, unknown>) {
          writes.push({ table, op: 'update', payload });
          return query(null);
        },
      };
    },
  } as never;
  return { supabase, writes };
}

describe('locked campaign delivery through the hourly outreach path', () => {
  afterEach(() => vi.unstubAllGlobals());

  it.each([1, 2, 3])('sends exact locked message %s with campaign identity and never falls back to a scorecard', async (sequenceStep) => {
    const contract = lockedContract();
    const { supabase, writes } = stubSupabase(contract, sequenceStep);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: `provider-${String(sequenceStep)}` }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await runOutreachForProspect({
      supabase,
      env: {
        RESEND_API_KEY: 're_test',
        RESEND_FROM_EMAIL: 'legacy@getgeopulse.com',
        SALES_REPLY_TO_EMAIL: 'legacy-reply@getgeopulse.com',
        GEOPULSE_CAMPAIGN_FROM_EMAIL: 'elena@getgeopulse.com',
        GEOPULSE_CAMPAIGN_REPLY_TO_EMAIL: 'reply@getgeopulse.com',
        GEOPULSE_CAMPAIGN_SENDER_VERIFIED: 'true',
        NEXT_PUBLIC_APP_URL: 'https://getgeopulse.com',
      },
      prospect: prospect(sequenceStep),
      nowMs: NOW,
    });

    expect(result).toEqual({ ok: true, scanId: null, score: null });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    const body = JSON.parse(String(request.body)) as Record<string, unknown>;
    expect(body.from).toBe('elena@getgeopulse.com');
    expect(body.reply_to).toBe('reply@getgeopulse.com');
    expect(body.subject).toBe(AGENCY_REPORTING_PILOT_STEPS[sequenceStep - 1]?.subject);
    expect(String(body.html)).toContain([
      'I run GEO-Pulse.',
      'Following up once on the AI visibility baseline',
      'Last note on this.',
    ][sequenceStep - 1]);
    expect(String(body.html)).not.toContain('AI search readiness score');
    expect(String(request.headers && (request.headers as Record<string, string>)['Idempotency-Key']))
      .toContain(`:step-${String(sequenceStep)}`);
    if (sequenceStep < 3) {
      expect(String(body.html)).toContain(`utm_content=agency-reporting-baseline-step-${String(sequenceStep)}`);
    }
    expect(writes.find((write) => write.table === 'outreach_sends' && write.op === 'insert')?.payload)
      .toMatchObject({ sequence_step: sequenceStep, campaign_send_key: `${AGENCY_REPORTING_PILOT_KEY}@v1:contact-1:step-${String(sequenceStep)}` });
  });
});
