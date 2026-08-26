import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from './middleware';

describe('public host middleware', () => {
  it('returns a permanent redirect before session handling for the legacy public host', async () => {
    const response = await middleware(
      new NextRequest(
        'https://www.getgeopulse.com/blog/grounded-vs-ungrounded-modes-explained?utm_source=google'
      )
    );

    expect(response.status).toBe(308);
    expect(response.headers.get('location')).toBe(
      'https://getgeopulse.com/blog/grounded-vs-ungrounded-modes-explained?utm_source=google'
    );
  });
});
