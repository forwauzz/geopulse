import { describe, expect, it } from 'vitest';
import { toSofiaResearchHandoff } from './sofia-research';

describe('Sofia research handoff', () => {
  it('surfaces grounded notes and the Jordan delivery state', () => {
    const note = toSofiaResearchHandoff(
      {
        id: 'asset-row-1',
        asset_id: 'proof_instagram_sofia-google-ai-visibility',
        title: 'Google made AI visibility measurable',
        status: 'approved',
        created_at: '2026-07-24T18:00:00.000Z',
        metadata: {
          researched_by_agent: 'sofia',
          evidence: {
            hook: 'Your AI search traffic is no longer one blended number.',
            source_url: 'https://developers.google.com/search/blog/example',
            source_label: 'Google Search Central',
            why_now: 'The reporting change is newly available.',
            original_angle: 'Show agencies how to turn the new signal into a client conversation.',
            audience: 'agency',
            score: 94,
            discovered_at: '2026-07-24T17:30:00.000Z',
          },
        },
      },
      {
        distribution_asset_id: 'asset-row-1',
        status: 'scheduled',
        scheduled_for: '2026-07-25T13:30:00.000Z',
        destination_url: null,
      }
    );

    expect(note).toMatchObject({
      sourceLabel: 'Google Search Central',
      audience: 'agency',
      score: 94,
      assetStatus: 'approved',
      jobStatus: 'scheduled',
      scheduledFor: '2026-07-25T13:30:00.000Z',
    });
    expect(note?.hook).toContain('AI search traffic');
  });

  it('rejects copied or malformed research records from the inbox', () => {
    expect(
      toSofiaResearchHandoff({
        id: 'asset-row-2',
        asset_id: 'manual',
        title: 'Manual post',
        status: 'draft',
        created_at: '2026-07-24T18:00:00.000Z',
        metadata: { researched_by_agent: 'jordan' },
      })
    ).toBeNull();
  });
});
