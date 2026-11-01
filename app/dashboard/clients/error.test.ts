import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import DashboardClientsError from './error';

describe('agency clients outage boundary', () => {
  it('withholds incomplete client data and preserves a retry path', () => {
    const html = renderToStaticMarkup(
      createElement(DashboardClientsError, {
        error: new Error('agency_clients_unavailable'),
        reset: vi.fn(),
      }),
    );

    expect(html).toContain('Your client workspace is temporarily unavailable.');
    expect(html).toContain('instead of showing an empty portfolio or incomplete client results');
    expect(html).toContain('Your saved client data has not been changed.');
    expect(html).toContain('Try again');
    expect(html).toContain('href="/dashboard"');
    expect(html).not.toContain('No clients yet');
    expect(html).not.toContain('Add client');
  });
});
