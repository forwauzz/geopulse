import { afterEach, describe, expect, it, vi } from 'vitest';
import { getTurnstileSiteKey } from './turnstile-site-key';

describe('getTurnstileSiteKey', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('returns empty when unset', () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');
    expect(getTurnstileSiteKey()).toBe('');
  });

  it('returns empty for wrangler placeholder (avoids Turnstile 400020)', () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', 'your-turnstile-site-key');
    expect(getTurnstileSiteKey()).toBe('');
  });

  it('returns trimmed real key', () => {
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', ' 0x4AAAAAAAx  ');
    expect(getTurnstileSiteKey()).toBe('0x4AAAAAAAx');
  });
});
