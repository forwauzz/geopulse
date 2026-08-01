import { describe, expect, it } from 'vitest';
import { loadGrowthCalendar } from './growth-calendar';

function query(data: unknown[]) {
  const result = Promise.resolve({ data, error: null });
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'order', 'limit', 'in', 'not', 'gte', 'eq']) {
    chain[method] = () => chain;
  }
  chain.then = result.then.bind(result);
  return chain;
}

describe('loadGrowthCalendar', () => {
  it('shows an approved manual LinkedIn post with its preview media and campaign lineage', async () => {
    const tables: Record<string, unknown[]> = {
      growth_campaigns: [{
        id: 'campaign-1',
        name: 'Quebec MSP first recurring customer',
        role: 'primary',
        vertical: 'msp_it_services',
        status: 'active',
        allocation_percent: 80,
        success_condition: 'One qualified scan.',
        stop_condition: 'Revise after the bounded window.',
        metadata: {},
      }],
      growth_campaign_interventions: [],
      content_items: [{
        id: 'content-1',
        content_id: 'msp-evidence',
        title: 'MSP evidence article',
        status: 'published',
        content_type: 'article',
        draft_markdown: 'Source article body',
        canonical_url: 'https://getgeopulse.com/blog/msp-evidence',
        approved_at: '2026-08-01T12:00:00.000Z',
        published_at: '2026-08-01T12:00:00.000Z',
        created_at: '2026-08-01T12:00:00.000Z',
        updated_at: '2026-08-01T12:00:00.000Z',
        growth_campaign_id: 'campaign-1',
        growth_intervention_id: null,
        metadata: {},
      }],
      distribution_assets: [{
        id: 'asset-row-1',
        asset_id: 'linkedin-msp-evidence-1',
        content_item_id: 'content-1',
        asset_type: 'single_image_post',
        provider_family: 'linkedin',
        title: 'Your MSP website needs evidence, not adjectives',
        body_plaintext: 'A specific LinkedIn post body.',
        caption_text: null,
        status: 'approved',
        cta_url: 'https://getgeopulse.com/blog/msp-evidence',
        approved_at: '2026-08-01T12:00:00.000Z',
        created_at: '2026-08-01T12:00:00.000Z',
        updated_at: '2026-08-01T12:00:00.000Z',
        growth_campaign_id: 'campaign-1',
        growth_intervention_id: null,
        metadata: {},
      }],
      distribution_asset_media: [{
        distribution_asset_id: 'asset-row-1',
        media_kind: 'image',
        storage_url: 'https://getgeopulse.com/branding/social/msp-evidence.jpg',
        alt_text: 'MSP evidence checklist',
        provider_ready_status: 'ready',
        sort_order: 0,
      }],
      distribution_jobs: [],
      distribution_accounts: [],
      outreach_prospects: [],
      outreach_sends: [],
      outreach_templates: [],
      outreach_reply_events: [],
      leads: [],
      agent_work_loops: [{
        id: 'loop-1',
        source_type: 'manual_distribution',
        source_key: 'linkedin-msp-evidence-1',
        lane: 'distribution',
        owner: 'sofia',
        state: 'assigned',
        severity: 'normal',
        title: 'Your MSP website needs evidence, not adjectives',
        detail: 'Scheduled LinkedIn post',
        next_action: 'Publish through the logged-in company page and record the URL.',
        due_at: '2099-08-03T13:00:00.000Z',
        attempt_count: 0,
        max_attempts: 3,
        founder_required: false,
        blocker: null,
        created_at: '2026-08-01T12:00:00.000Z',
        updated_at: '2026-08-01T12:00:00.000Z',
        metadata: {
          channel: 'linkedin',
          manual_publish: true,
          distribution_asset_id: 'asset-row-1',
          growth_campaign_id: 'campaign-1',
          funnel_stage: 'qualified traffic',
        },
      }],
    };

    const data = await loadGrowthCalendar({ from: (table: string) => query(tables[table] ?? []) });
    const activity = data.activities.find((row) => row.id === 'loop:loop-1');

    expect(activity).toMatchObject({
      channel: 'linkedin',
      displayState: 'next',
      owner: 'Sofia',
      previewText: 'A specific LinkedIn post body.',
      campaignName: 'Quebec MSP first recurring customer',
      campaignRole: 'primary',
      vertical: 'msp_it_services',
      approvalLabel: 'Approved manual publishing asset',
      outcomeValue: 'Scheduled browser fallback',
      detailHref: '/dashboard/distribution',
    });
    expect(activity?.media).toEqual([
      expect.objectContaining({
        url: 'https://getgeopulse.com/branding/social/msp-evidence.jpg',
        readyStatus: 'ready',
      }),
    ]);
  });
});
