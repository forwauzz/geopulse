import { describe, expect, it } from 'vitest';
import { shouldRejectForMiddlewareSubrequest } from './middleware-cve';

describe('shouldRejectForMiddlewareSubrequest (CVE-2025-29927)', () => {
  it('returns false when header absent', () => {
    const h = new Headers();
    expect(shouldRejectForMiddlewareSubrequest(h)).toBe(false);
  });

  it('returns true when x-middleware-subrequest is present', () => {
    const h = new Headers();
    h.set('x-middleware-subrequest', '1');
    expect(shouldRejectForMiddlewareSubrequest(h)).toBe(true);
  });
});
