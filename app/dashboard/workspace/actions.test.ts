import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  createServiceRoleClientMock,
  createSupabaseServerClientMock,
  getPaymentApiEnvMock,
  redirectMock,
  revalidatePathMock,
  upsertUserScheduleMock,
} = vi.hoisted(() => ({
  createServiceRoleClientMock: vi.fn(),
  createSupabaseServerClientMock: vi.fn(),
  getPaymentApiEnvMock: vi.fn(async () => ({
    NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service-role',
  })),
  redirectMock: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
  revalidatePathMock: vi.fn(),
  upsertUserScheduleMock: vi.fn(async () => ({ ok: true })),
}));

vi.mock('next/navigation', () => ({ redirect: redirectMock }));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));
vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: createSupabaseServerClientMock,
}));
vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: createServiceRoleClientMock,
}));
vi.mock('@/lib/server/cf-env', () => ({ getPaymentApiEnv: getPaymentApiEnvMock }));
vi.mock('@/lib/server/recurring-audits', () => ({
  upsertUserSchedule: upsertUserScheduleMock,
  runUserAuditNow: vi.fn(),
}));

import { saveMyRecurringAudit } from './actions';

describe('workspace recurring-audit actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createSupabaseServerClientMock.mockResolvedValue({
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: 'user-1' } },
        })),
      },
    });
  });

  it('fails closed before saving when workspace membership cannot be read', async () => {
    createServiceRoleClientMock.mockReturnValue({
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            limit: vi.fn(() => ({
              maybeSingle: vi.fn(async () => ({
                data: null,
                error: { code: 'PGRST000', message: 'database unavailable' },
              })),
            })),
          })),
        })),
      })),
    });

    const form = new FormData();
    form.set('url', 'https://msp.example');
    form.set('cadence', 'weekly');
    form.set('enabled', 'true');

    await expect(saveMyRecurringAudit(form)).rejects.toThrow(
      'redirect:/dashboard/workspace?recurring=error'
    );

    expect(upsertUserScheduleMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
