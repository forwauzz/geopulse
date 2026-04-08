import { beforeEach, describe, expect, it, vi } from 'vitest';

const cancelMock = vi.fn();
const deleteUserMock = vi.fn();
const isUserPlatformAdminMock = vi.fn();
const getPaymentApiEnvMock = vi.fn();

vi.mock('@/lib/server/cf-env', () => ({
  getPaymentApiEnv: () => getPaymentApiEnvMock(),
}));

vi.mock('@/lib/server/require-admin', () => ({
  isUserPlatformAdmin: (userId: string, adminDb: unknown) => isUserPlatformAdminMock(userId, adminDb),
}));

vi.mock('@/lib/server/stripe-client', () => ({
  createStripeClient: () => ({
    subscriptions: {
      cancel: cancelMock,
    },
  }),
}));

type QueryResponse = {
  data: unknown;
  error: { message: string } | null;
};

function createQueryBuilder(response: QueryResponse) {
  const state = {
    mode: 'read' as 'read' | 'delete',
  };

  const builder: any = {
    select: vi.fn(() => {
      if (state.mode === 'delete') {
        return Promise.resolve(response);
      }
      state.mode = 'read';
      return builder;
    }),
    delete: vi.fn(() => {
      state.mode = 'delete';
      return builder;
    }),
    eq: vi.fn(() => builder),
    in: vi.fn(() => builder),
    maybeSingle: vi.fn(() => Promise.resolve(response)),
    then: vi.fn((resolve: (value: QueryResponse) => unknown, reject: (reason?: unknown) => unknown) =>
      Promise.resolve(response).then(resolve, reject),
    ),
  };

  return builder;
}

function createAdminDb(overrides?: Record<string, QueryResponse>) {
  const fromMock = vi.fn((table: string) => {
    const response =
      overrides?.[table] ??
      ({
        data: [{ id: `${table}-row` }],
        error: null,
      } satisfies QueryResponse);
    return createQueryBuilder(response);
  });

  const auth = {
    admin: {
      deleteUser: deleteUserMock,
    },
  };

  return {
    from: fromMock,
    auth,
  } as any;
}

describe('hardDeleteUserAccount', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    getPaymentApiEnvMock.mockResolvedValue({ STRIPE_SECRET_KEY: 'sk_test_123' });
    deleteUserMock.mockResolvedValue({ error: null });
  });

  it('blocks deleting platform admin accounts', async () => {
    const adminDb = createAdminDb({
      users: { data: { id: 'target-user', email: 'target@example.com' }, error: null },
    });
    isUserPlatformAdminMock.mockResolvedValue(true);

    const { hardDeleteUserAccount } = await import('./user-deletion');

    await expect(
      hardDeleteUserAccount({
        adminDb,
        requestedByUserId: 'admin-user',
        targetUserId: 'target-user',
        confirmEmail: 'target@example.com',
      }),
    ).rejects.toThrow('Platform admin accounts cannot be deleted from this screen.');

    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it('cancels live subscriptions and deletes user-owned records before deleting auth user', async () => {
    const adminDb = createAdminDb({
      users: { data: { id: 'target-user', email: 'target@example.com' }, error: null },
      user_subscriptions: {
        data: [
          { stripe_subscription_id: 'sub_live_1', status: 'active' },
          { stripe_subscription_id: 'admin_comp:target-user', status: 'active' },
          { stripe_subscription_id: 'sub_live_2', status: 'trialing' },
        ],
        error: null,
      },
      scans: { data: [{ id: 'scan-1' }, { id: 'scan-2' }], error: null },
      payments: { data: [{ id: 'payment-1' }], error: null },
    });
    isUserPlatformAdminMock.mockResolvedValue(false);

    const { hardDeleteUserAccount } = await import('./user-deletion');

    const result = await hardDeleteUserAccount({
      adminDb,
      requestedByUserId: 'admin-user',
      targetUserId: 'target-user',
      confirmEmail: 'target@example.com',
    });

    expect(result).toEqual({
      deletedEmail: 'target@example.com',
      cancelledStripeSubscriptionIds: ['sub_live_1', 'sub_live_2'],
      deletedScans: 2,
      deletedPayments: 1,
    });
    expect(cancelMock).toHaveBeenCalledTimes(2);
    expect(deleteUserMock).toHaveBeenCalledWith('target-user');

    const fromTables = (adminDb.from as { mock: { calls: Array<[string]> } }).mock.calls.map(
      ([table]) => table,
    );

    expect(fromTables).toEqual(
      expect.arrayContaining([
        'users',
        'user_subscriptions',
        'content_items',
        'distribution_accounts',
        'distribution_assets',
        'distribution_jobs',
        'startup_recommendations',
        'startup_implementation_plans',
        'startup_github_installations',
        'startup_github_install_sessions',
        'startup_slack_installations',
        'startup_slack_install_sessions',
        'startup_agent_pr_runs',
        'scans',
        'payments',
      ]),
    );
  });
});
