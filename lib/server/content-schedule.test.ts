import { describe, expect, it } from 'vitest';
import { CONTENT_SCHEDULE, CONTENT_SCHEDULE_POLICY, validateContentSchedule } from './content-schedule';

describe('content schedule', () => {
  it('keeps two weeks of LinkedIn inventory with the bounded primary/challenger allocation', () => {
    expect(validateContentSchedule(CONTENT_SCHEDULE)).toEqual([]);
    const linkedin = CONTENT_SCHEDULE.filter((item) => item.channel === 'linkedin');
    expect(linkedin).toHaveLength(CONTENT_SCHEDULE_POLICY.linkedinPostsPerWeek * 2);
    expect(linkedin.filter((item) => item.campaignRole === 'primary')).toHaveLength(5);
    expect(linkedin.filter((item) => item.campaignRole === 'challenger')).toHaveLength(1);
    expect(linkedin.map((item) => new Date(item.scheduledFor).getUTCDay())).toEqual([1, 3, 5, 1, 3, 5]);
  });

  it('requires provider-ready media for Instagram schedule items', () => {
    const instagram = CONTENT_SCHEDULE.filter((item) => item.channel === 'instagram');
    expect(instagram).toHaveLength(1);
    expect(instagram.every((item) => Boolean(item.mediaUrl && item.mediaAlt))).toBe(true);
  });
});
