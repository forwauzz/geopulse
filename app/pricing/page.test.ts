import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authClientMock,
  getPaymentApiEnvMock,
  loadUiFlagSnapshotMock,
  redirectMock,
} = vi.hoisted(() => ({
  authClientMock: vi.fn(),
  getPaymentApiEnvMock: vi.fn(async () => ({ NEXT_PUBLIC_APP_URL: 'https://getgeopulse.com/' })),
  loadUiFlagSnapshotMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

vi.mock('next/navigation', () => ({ redirect: redirectMock, useSearchParams: vi.fn() }));
vi.mock('@/lib/server/app-ui-flags', () => ({ loadUiFlagSnapshot: loadUiFlagSnapshotMock }));
vi.mock('@/lib/server/cf-env', () => ({ getPaymentApiEnv: getPaymentApiEnvMock }));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: authClientMock }));

import PricingPage, { generateMetadata } from './page';

describe('pricing outage behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders a truthful non-checkout state when UI flags cannot be read', async () => {
    loadUiFlagSnapshotMock.mockResolvedValue({
      flags: { show_pricing: false },
      status: 'unavailable',
    });

    const html = renderToStaticMarkup(await PricingPage());

    expect(html).toContain('Pricing and checkout are temporarily unavailable.');
    expect(html).toContain('Nothing has been charged or started.');
    expect(html).toContain('Business');
    expect(html).toContain('Agency Scale');
    expect(html).not.toContain('Start Business trial');
    expect(html).not.toContain('Subscribe');
    expect(authClientMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it('keeps an intentional loaded false flag hidden', async () => {
    loadUiFlagSnapshotMock.mockResolvedValue({
      flags: { show_pricing: false },
      status: 'loaded',
    });

    await expect(PricingPage()).rejects.toThrow('redirect:/login');
  });

  it('marks the temporary fallback noindex without blocking link discovery', async () => {
    loadUiFlagSnapshotMock.mockResolvedValue({
      flags: { show_pricing: false },
      status: 'unavailable',
    });

    const metadata = await generateMetadata();

    expect(metadata.title).toBe('Pricing temporarily unavailable | GEO-Pulse');
    expect(metadata.robots).toEqual({ index: false, follow: true });
  });
});
