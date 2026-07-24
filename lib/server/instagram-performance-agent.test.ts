import { describe, expect, it } from 'vitest';
import { parseInstagramInsights } from './instagram-performance-agent';

describe('Instagram performance learning', () => {
  it('normalizes owned-media fields and insight values', () => {
    expect(parseInstagramInsights(
      { like_count: 7, comments_count: 3 },
      {
        data: [
          { name: 'views', values: [{ value: 120 }] },
          { name: 'reach', values: [{ value: 80 }] },
          { name: 'saved', values: [{ value: 5 }] },
          { name: 'shares', values: [{ value: 4 }] },
          { name: 'follows', values: [{ value: 2 }] },
          { name: 'profile_activity', values: [{ value: 9 }] },
        ],
      }
    )).toEqual({
      views: 120,
      reach: 80,
      likes: 7,
      comments: 3,
      saves: 5,
      shares: 4,
      follows: 2,
      profileActivity: 9,
    });
  });
});

