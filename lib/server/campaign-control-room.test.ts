import { describe, expect, it } from 'vitest';
import {
  isOperationsExcludedBenchmarkConfig,
  socialExperimentDetail,
  summarizeCampaignHealth,
  summarizeRuntimeHealth,
  type CampaignItem,
} from './campaign-control-room';

describe('isOperationsExcludedBenchmarkConfig', () => {
  it('excludes only configs explicitly marked outside production operations', () => {
    expect(isOperationsExcludedBenchmarkConfig({
      operations_excluded: true,
      operations_excluded_reason: 'orphaned QA fixture',
    })).toBe(true);
    expect(isOperationsExcludedBenchmarkConfig({
      operations_excluded: false,
    })).toBe(false);
    expect(isOperationsExcludedBenchmarkConfig({
      operations_excluded_reason: 'reason without an explicit control flag',
    })).toBe(false);
  });
});

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

describe('summarizeRuntimeHealth', () => {
  it('keeps consecutive runtime failures visible even when inventory still exists', () => {
    const logs = [
      {
        event: 'social_proof_agent_run',
        level: 'error',
        created_at: '2026-07-27T08:00:00.000Z',
        data: { status: 'failed' },
      },
      {
        event: 'social_proof_agent_run',
        level: 'error',
        created_at: '2026-07-27T07:00:00.000Z',
        data: { status: 'failed' },
      },
      {
        event: 'social_proof_agent_run',
        level: 'info',
        created_at: '2026-07-27T06:00:00.000Z',
        data: { status: 'success' },
      },
    ];

    expect(summarizeRuntimeHealth(logs, 'social_proof_agent_run')).toEqual({
      consecutiveFailures: 2,
      lastRunAt: '2026-07-27T08:00:00.000Z',
      lastStatus: 'failed',
    });
  });

  it('closes the incident only after a successful runtime signal', () => {
    const logs = [
      {
        event: 'social_proof_agent_run',
        level: 'info',
        created_at: '2026-07-27T09:00:00.000Z',
        data: { status: 'success' },
      },
      {
        event: 'social_proof_agent_run',
        level: 'error',
        created_at: '2026-07-27T08:00:00.000Z',
        data: { status: 'failed' },
      },
    ];

    expect(summarizeRuntimeHealth(logs, 'social_proof_agent_run')).toMatchObject({
      consecutiveFailures: 0,
      lastStatus: 'success',
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
