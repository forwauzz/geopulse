import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createServiceRoleClientMock,
  getScanApiEnvMock,
  notFoundMock,
  structuredErrorMock,
} = vi.hoisted(() => ({
  createServiceRoleClientMock: vi.fn(),
  getScanApiEnvMock: vi.fn(async () => ({
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  })),
  notFoundMock: vi.fn(() => {
    throw new Error('not_found');
  }),
  structuredErrorMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({ notFound: notFoundMock }));
vi.mock('@/lib/server/cf-env', () => ({ getScanApiEnv: getScanApiEnvMock }));
vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient: createServiceRoleClientMock }));
vi.mock('@/lib/server/structured-log', () => ({ structuredError: structuredErrorMock }));
vi.mock('@/lib/server/report-branding-settings', () => ({
  getBrandSettingsView: vi.fn(),
  resolveReportFilesPublicBase: vi.fn(async () => 'https://reports.example.com'),
}));
vi.mock('@/lib/server/load-agency-report-snapshot', () => ({ loadLatestAgencyReport: vi.fn() }));
vi.mock('@/lib/server/client-outcome-engine', () => ({ loadClientOutcomeEngine: vi.fn() }));

import ClientSummaryError from './error';
import ClientSummaryPage from './page';

describe('client summary outage behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not convert a database outage into a false not-found result', async () => {
    createServiceRoleClientMock.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({
              data: null,
              error: { code: 'PGRST000', message: 'database unavailable' },
            })),
          })),
        })),
      })),
    });

    await expect(ClientSummaryPage({
      params: Promise.resolve({ clientId: '8971dc91-4ea2-481c-bd91-d3660946b38c' }),
      searchParams: Promise.resolve({ share: 'outage-probe' }),
    })).rejects.toThrow('client_summary_unavailable');

    expect(notFoundMock).not.toHaveBeenCalled();
    expect(structuredErrorMock).toHaveBeenCalledWith(
      'client_summary_database_unavailable',
      { stage: 'client_lookup', errorCode: 'PGRST000' }
    );
  });

  it('preserves an honest not-found result when the database read succeeds without a client', async () => {
    createServiceRoleClientMock.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      })),
    });

    await expect(ClientSummaryPage({
      params: Promise.resolve({ clientId: '8971dc91-4ea2-481c-bd91-d3660946b38c' }),
      searchParams: Promise.resolve({ share: 'unknown-share' }),
    })).rejects.toThrow('not_found');

    expect(notFoundMock).toHaveBeenCalledOnce();
    expect(structuredErrorMock).not.toHaveBeenCalled();
  });

  it('renders a truthful customer-safe interruption without provider details', () => {
    const html = renderToStaticMarkup(ClientSummaryError({
      error: new Error('sensitive provider detail'),
      reset: () => undefined,
    }));

    expect(html).toContain('This client report is temporarily unavailable.');
    expect(html).toContain('instead of showing an incomplete or missing result');
    expect(html).not.toContain('sensitive provider detail');
  });
});
