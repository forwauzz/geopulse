import { describe, expect, it } from 'vitest';
import {
  socialExperimentDetail,
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

describe('socialExperimentDetail', () => {
  it('keeps a scheduled creative stream visibly pending before publication', () => {
    expect(socialExperimentDetail(
      { creative_stream: 'engine-experiment' },
      'instagram delivery job',
    )).toBe('engine experiment stream · Performance tracking starts after publication.');
  });

  it('surfaces the latest Instagram stream metrics in the campaign row', () => {
    expect(socialExperimentDetail(
      {
        creative_stream: 'proof-guide',
        instagram_performance: {
          views: 1250,
          reach: 840,
          saves: 18,
          shares: 7,
        },
      },
      'instagram delivery job',
    )).toBe('proof guide stream · 1,250 views · 840 reach · 18 saves · 7 shares');
  });

  it('leaves ordinary social delivery copy unchanged', () => {
    expect(socialExperimentDetail({}, 'instagram delivery job'))
      .toBe('instagram delivery job');
  });
});
