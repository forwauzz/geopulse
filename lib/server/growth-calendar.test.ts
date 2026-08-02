import { describe, expect, it } from 'vitest';
import { loadGrowthCalendar, type GrowthCalendarActivity } from './growth-calendar';

/**
 * The calendar reads a dozen tables. This stub answers every one with an empty list except the
 * ones a test cares about, so a card assertion is not silently satisfied by unrelated rows.
 */
function stubSupabase(tables: Record<string, unknown[]>) {
  function query(rows: unknown[]): any {
    const builder: any = Promise.resolve({ data: rows, error: null });
    builder.eq = () => builder;
    builder.in = () => builder;
    builder.not = () => builder;
    builder.limit = () => builder;
    builder.order = () => builder;
    return builder;
  }
  return {
    from(table: string) {
      return { select: () => query(tables[table] ?? []) };
    },
  };
}

function emailCampaignIntervention(state: string, overrides: Record<string, unknown> = {}) {
  return {
    id: 'int-1',
    campaign_id: 'camp-1',
    intervention_key: 'agency-reporting-montreal-v1',
    name: 'Agency reporting — Montreal',
    channel: 'email',
    status: 'planned',
    updated_at: '2026-08-02T00:00:00.000Z',
    metadata: {
      owner: 'elena',
      email_campaign: {
        current: 1,
        versions: {
          '1': {
            contract: 'email_campaign_v1',
            interventionKey: 'agency-reporting-montreal-v1',
            version: 1,
            state,
            goal: {
              owner: 'elena',
              successCondition: 'At least one qualified reply',
              stopCondition: '25 accepted first messages with zero qualified replies',
            },
            sender: { displayName: 'Elena at GEO-Pulse', authenticated: false },
            audience: { segment: 'agency-ca-qc-montreal-published-2026-08', recipientCount: 25 },
            content: { subject: 'AI visibility baseline for {{company}}', bodyTemplate: 'Hi {{name}},' },
            schedule: { startAt: '2026-08-10T13:00:00.000Z' },
            governance: { scheduledAt: null, testAcceptedAt: null, stopReason: null },
            ...overrides,
          },
        },
      },
    },
  };
}

async function emailCard(state: string, overrides: Record<string, unknown> = {}): Promise<GrowthCalendarActivity> {
  const data = await loadGrowthCalendar(
    stubSupabase({ growth_campaign_interventions: [emailCampaignIntervention(state, overrides)] }),
  );
  const card = data.activities.find((activity) => activity.sourceType === 'email_campaign');
  if (!card) throw new Error(`no email campaign card for state ${state}`);
  return card;
}

describe('email campaign calendar cards', () => {
  it('distinguishes preparation, scheduled, sending, and terminal states in plain language', async () => {
    const expected: Array<[string, string, GrowthCalendarActivity['displayState']]> = [
      ['draft', 'Draft', 'action'],
      ['audience_ready', 'In preparation', 'action'],
      ['test_passed', 'Internal test passed', 'action'],
      ['scheduled', 'Scheduled', 'next'],
      ['running', 'Sending', 'live'],
      ['evaluating', 'Evaluating', 'live'],
      ['completed', 'Complete', 'live'],
      ['stopped', 'Stopped', 'stopped'],
    ];
    for (const [state, label, displayState] of expected) {
      const card = await emailCard(state);
      expect(card.statusLabel).toBe(label);
      expect(card.displayState).toBe(displayState);
    }
  });

  it('never claims an authenticated sender that does not exist', async () => {
    const card = await emailCard('scheduled');
    expect(card.senderLine).toBe('No authenticated GEO-Pulse sender configured');
    expect(card.dependencies).toContain('No authenticated GEO-Pulse sending identity');
  });

  it('shows the recipient count, scheduled time, owner, and the exact locked subject and body', async () => {
    const card = await emailCard('scheduled');
    expect(card.recipientCount).toBe(25);
    expect(card.startsAt).toBe('2026-08-10T13:00:00.000Z');
    expect(card.owner).toBe('Elena');
    expect(card.previewTitle).toBe('AI visibility baseline for {{company}}');
    expect(card.previewText).toBe('Hi {{name}},');
    expect(card.summary).toContain('25 frozen recipients');
  });

  it('opens the campaign by its intervention key rather than a generic outreach page', async () => {
    const card = await emailCard('scheduled');
    expect(card.detailHref).toBe('/admin/campaigns/email/agency-reporting-montreal-v1');
  });

  it('carries the declared success and stop conditions onto the card', async () => {
    const card = await emailCard('running');
    expect(card.successCondition).toBe('At least one qualified reply');
    expect(card.stopCondition).toContain('zero qualified replies');
  });

  it('shows the stop reason on a stopped campaign', async () => {
    const card = await emailCard('stopped', {
      governance: { scheduledAt: '2026-08-09T00:00:00.000Z', testAcceptedAt: null, stopReason: 'deliverability incident' },
    });
    expect(card.outcomeValue).toBe('deliverability incident');
    expect(card.nextAction).toContain('Record the stop reason');
  });

  it('produces no email campaign card for an intervention without a contract', async () => {
    const data = await loadGrowthCalendar(
      stubSupabase({
        growth_campaign_interventions: [{
          id: 'int-2', campaign_id: 'camp-1', intervention_key: 'msp-qc-reply-first-followup-v1',
          name: 'MSP reply-first', channel: 'email', status: 'running',
          started_at: '2026-07-01T00:00:00.000Z', updated_at: '2026-07-01T00:00:00.000Z', metadata: {},
        }],
      }),
    );
    expect(data.activities.some((activity) => activity.sourceType === 'email_campaign')).toBe(false);
    // The existing experiment card still appears — this addition does not replace it.
    expect(data.activities.some((activity) => activity.sourceType === 'experiment')).toBe(true);
  });
});
