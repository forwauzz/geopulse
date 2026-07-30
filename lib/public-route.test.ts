import { describe, expect, it } from 'vitest';
import { isPublicSiteRoute } from './public-route';

describe('isPublicSiteRoute', () => {
  it.each(['/', '/blog', '/blog/example', '/pricing', '/solutions/msps', '/walkthrough', '/login'])(
    'brands public route %s',
    (pathname) => expect(isPublicSiteRoute(pathname)).toBe(true),
  );

  it.each(['/dashboard', '/dashboard/clients', '/admin', '/results/abc', '/share/abc', '/dev/tools'])(
    'leaves product route %s unchanged',
    (pathname) => expect(isPublicSiteRoute(pathname)).toBe(false),
  );
});
