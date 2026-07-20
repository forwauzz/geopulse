import { describe, expect, it } from 'vitest';
import { resolveAuthMode } from './auth-mode';

describe('/login form selection', () => {
  it('shows sign-in to someone bounced off a protected page', () => {
    // The regression: middleware sends an expired session to /login?next=/dashboard, and the user
    // landed on "Sign up for free" — so returning users reported that sign-in was missing.
    expect(resolveAuthMode({ next: '/dashboard' })).toBe('signin');
    expect(resolveAuthMode({ next: '/dashboard/connectors' })).toBe('signin');
  });

  it('still defaults to the free sign-up for visitors arriving cold', () => {
    // Marketing CTAs link to a bare /login and must keep the #24 behaviour.
    expect(resolveAuthMode({})).toBe('signup');
    expect(resolveAuthMode({ next: undefined })).toBe('signup');
  });

  it('lets an explicit mode override either default', () => {
    expect(resolveAuthMode({ mode: 'signin' })).toBe('signin');
    expect(resolveAuthMode({ mode: 'signup', next: '/dashboard' })).toBe('signup');
  });

  it('treats an unrecognised mode as sign-up rather than erroring', () => {
    expect(resolveAuthMode({ mode: 'nonsense' })).toBe('signup');
  });
});
