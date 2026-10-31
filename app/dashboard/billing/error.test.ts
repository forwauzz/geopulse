import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import DashboardBillingError from './error';

describe('dashboard billing outage boundary', () => {
  it('withholds inaccurate billing state and preserves a retry path', () => {
    const html = renderToStaticMarkup(
      createElement(DashboardBillingError, {
        error: new Error('billing_dashboard_unavailable'),
        reset: vi.fn(),
      }),
    );

    expect(html).toContain('Your billing details are temporarily unavailable.');
    expect(html).toContain('instead of showing an empty or inaccurate account');
    expect(html).toContain('Your subscription has not been changed.');
    expect(html).toContain('Try again');
    expect(html).toContain('href="/dashboard"');
    expect(html).not.toContain('No active subscription');
    expect(html).not.toContain('View plans');
  });
});
