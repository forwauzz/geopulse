import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import DashboardHomeError from './error';

describe('dashboard home outage boundary', () => {
  it('withholds inaccurate workspace state and preserves a retry path', () => {
    const html = renderToStaticMarkup(
      createElement(DashboardHomeError, {
        error: new Error('database hostname leaked'),
        reset: vi.fn(),
      }),
    );

    expect(html).toContain('Your dashboard is temporarily unavailable.');
    expect(html).toContain('instead of showing an empty or inaccurate workspace');
    expect(html).toContain('Your scans, workspace, and subscription were not changed.');
    expect(html).toContain('Try again');
    expect(html).toContain('href="/"');
    expect(html).not.toContain('database hostname leaked');
    expect(html).not.toContain('Run your first audit');
  });
});
