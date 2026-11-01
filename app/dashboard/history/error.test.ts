import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import DashboardHistoryError from './error';

describe('DashboardHistoryError', () => {
  it('renders a sanitized temporary interruption with safe navigation', () => {
    const html = renderToStaticMarkup(
      createElement(DashboardHistoryError, {
        error: new Error('database hostname leaked'),
        reset: vi.fn(),
      }),
    );

    expect(html).toContain('Your reports are temporarily unavailable.');
    expect(html).toContain('Your saved scans, reports, and subscription were not changed.');
    expect(html).toContain('Try again');
    expect(html).toContain('href="/dashboard"');
    expect(html).not.toContain('database hostname leaked');
  });
});
