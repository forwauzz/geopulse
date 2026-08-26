import { describe, expect, it } from 'vitest';
import { resolvePublicHostRedirect } from './public-host-redirect';

describe('resolvePublicHostRedirect', () => {
  it('permanently consolidates the legacy www host while preserving path and query', () => {
    expect(
      resolvePublicHostRedirect(
        'https://www.getgeopulse.com/blog/grounded-vs-ungrounded-modes-explained?utm_source=google'
      )?.toString()
    ).toBe(
      'https://getgeopulse.com/blog/grounded-vs-ungrounded-modes-explained?utm_source=google'
    );
  });

  it('normalizes an http legacy request to the canonical https origin', () => {
    expect(resolvePublicHostRedirect('http://www.getgeopulse.com/')?.toString()).toBe(
      'https://getgeopulse.com/'
    );
  });

  it.each([
    'https://getgeopulse.com/',
    'http://localhost:3000/',
    'https://geo-pulse.example.workers.dev/',
  ])('does not redirect non-legacy hosts: %s', (url) => {
    expect(resolvePublicHostRedirect(url)).toBeNull();
  });
});
