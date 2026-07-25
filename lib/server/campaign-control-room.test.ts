import { describe, expect, it } from 'vitest';
import {
  summarizeCampaignHealth,
  type CampaignItem,
} from './campaign-control-room';

function campaign(health: CampaignItem['health']): CampaignItem {
  return {
    id: `campaign:${health}`,
    lane: 'social',
    name: 'Campaign',
    channel: 'Instagram',
    status: health,
    health,
    owner: 'Jordan',
    lastActivityAt: null,
    nextActivityAt: null,
    detail: 'Test campaign',
    href: '/admin/campaigns',
  };
}

describe('summarizeCampaignHealth', () => {
  it('reports an all-clear only when campaigns and the scheduler are healthy', () => {
    expect(summarizeCampaignHealth([campaign('healthy')], true)).toEqual({
      health: 'healthy',
      summary: 'All 1 tracked campaign workflows are on schedule.',
    });
  });

  it('keeps overdue work visible without calling it blocked', () => {
    expect(summarizeCampaignHealth([campaign('attention')], true)).toEqual({
      health: 'attention',
      summary: '0 blocked and 1 overdue or stale campaign workflow need an owner.',
    });
  });

  it('treats a stale scheduler heartbeat as blocked even with no campaign failures', () => {
    expect(summarizeCampaignHealth([campaign('healthy')], false)).toEqual({
      health: 'blocked',
      summary: '0 blocked and 0 overdue or stale campaign workflows; the hourly scheduler heartbeat also needs immediate attention.',
    });
  });
});
