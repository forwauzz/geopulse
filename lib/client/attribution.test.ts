import { afterEach, describe, expect, it, vi } from 'vitest';
import { ensureAnonymousId } from './attribution';

function installCookieDocument(initial = ''): { getCookie: () => string } {
  let cookie = initial;
  vi.stubGlobal('document', {
    get cookie() {
      return cookie;
    },
    set cookie(value: string) {
      // Browsers expose only the name=value pair through document.cookie.
      cookie = value.split(';', 1)[0] ?? '';
    },
  });
  return { getCookie: () => cookie };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ensureAnonymousId', () => {
  it('creates a first-party random id once and reuses it on later visits', () => {
    const doc = installCookieDocument();
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'visitor-uuid') });

    expect(ensureAnonymousId()).toBe('visitor-uuid');
    expect(doc.getCookie()).toBe('gp_anon_id=visitor-uuid');
    expect(ensureAnonymousId()).toBe('visitor-uuid');
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1);
  });

  it('does not replace an existing anonymous id', () => {
    installCookieDocument('gp_anon_id=existing-visitor');
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'new-visitor') });

    expect(ensureAnonymousId()).toBe('existing-visitor');
    expect(crypto.randomUUID).not.toHaveBeenCalled();
  });
});
