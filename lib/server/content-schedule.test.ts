import { describe, expect, it } from 'vitest';
import { CONTENT_SCHEDULE, CONTENT_SCHEDULE_POLICY, validateContentSchedule } from './content-schedule';

describe('12-week evergreen content schedule', () => {
  it('keeps three posts per week with bounded MSP primary and agency challenger allocation', () => {
    expect(validateContentSchedule(CONTENT_SCHEDULE)).toEqual([]);
    expect(CONTENT_SCHEDULE).toHaveLength(
      CONTENT_SCHEDULE_POLICY.evergreenWeeks * CONTENT_SCHEDULE_POLICY.postsPerWeek
    );
    expect(CONTENT_SCHEDULE.filter((item) => item.campaignRole === 'primary')).toHaveLength(29);
    expect(CONTENT_SCHEDULE.filter((item) => item.campaignRole === 'challenger')).toHaveLength(7);
    for (let week = 1; week <= 12; week += 1) {
      expect(CONTENT_SCHEDULE.filter((item) => item.week === week)).toHaveLength(3);
    }
  });

  it('schedules two LinkedIn posts and one provider-ready Instagram post every week', () => {
    const linkedin = CONTENT_SCHEDULE.filter((item) => item.channel === 'linkedin');
    const instagram = CONTENT_SCHEDULE.filter((item) => item.channel === 'instagram');
    expect(linkedin).toHaveLength(24);
    expect(instagram).toHaveLength(12);
    expect(linkedin.map((item) => new Date(item.scheduledFor).getUTCDay()))
      .toEqual(Array.from({ length: 12 }, () => [1, 5]).flat());
    expect(instagram.every((item) => (
      new Date(item.scheduledFor).getUTCDay() === 3
      && Boolean(item.mediaUrl && item.mediaAlt)
    ))).toBe(true);
  });

  it('gives every post attribution, ownership, retry, claim, success, and stop contracts', () => {
    for (const item of CONTENT_SCHEDULE) {
      expect(item.ctaUrl).toContain('utm_campaign=msp_evergreen_2026_q3');
      expect(item.ctaUrl).toContain(`utm_content=${item.assetId}`);
      expect(item.owner).toMatch(/^(jordan|sofia)$/);
      expect(item.retryPolicy).toContain('three');
      expect(item.claimBoundary).toContain('no ranking');
      expect(item.successCondition).toContain('qualified');
      expect(item.stopCondition).toContain('Stop');
    }
  });
});
