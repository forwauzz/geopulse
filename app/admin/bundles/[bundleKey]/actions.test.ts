import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidatePath = vi.fn();
const structuredLog = vi.fn();
const loadAdminActionContext = vi.fn();

vi.mock('next/cache', () => ({
  revalidatePath: (...args: unknown[]) => revalidatePath(...args),
}));

vi.mock('@/lib/server/structured-log', () => ({
  structuredLog: (...args: unknown[]) => structuredLog(...args),
}));

vi.mock('@/lib/server/admin-runtime', () => ({
  loadAdminActionContext: (...args: unknown[]) => loadAdminActionContext(...args),
}));

function createAdminDbMock(args: {
  readonly bundleId: string;
  readonly bundleKey: string;
  readonly existing?: {
    readonly id: string;
    readonly enabled: boolean;
    readonly access_mode: string | null;
    readonly usage_limit: number | null;
    readonly metadata: Record<string, unknown>;
  } | null;
}) {
  const upsertCalls: Array<{ rows: unknown[]; options: Record<string, unknown> }> = [];

  return {
    upsertCalls,
    from(table: string) {
      const filters: Record<string, unknown> = {};
      return {
        select() {
          return this;
        },
        eq(field: string, value: unknown) {
          filters[field] = value;
          return this;
        },
        maybeSingle() {
          if (table === 'service_bundles') {
            return Promise.resolve({
              data: filters['bundle_key'] === args.bundleKey ? { id: args.bundleId, bundle_key: args.bundleKey } : null,
              error: null,
            });
          }
          if (table === 'service_bundle_services') {
            const matchesBundle = filters['bundle_id'] === args.bundleId;
            const matchesService = typeof filters['service_id'] === 'string';
            return Promise.resolve({
              data: matchesBundle && matchesService ? args.existing ?? null : null,
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
        upsert(rows: unknown[], options: Record<string, unknown>) {
          upsertCalls.push({ rows, options });
          return Promise.resolve({ error: null });
        },
      };
    },
  } as any;
}

describe('bundle editor actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadAdminActionContext.mockResolvedValue({
      ok: true,
      user: { id: 'admin-1' },
      adminDb: null,
    });
  });

  it('stores included services as free bundle rows', async () => {
    const adminDb = createAdminDbMock({
      bundleId: 'bundle-1',
      bundleKey: 'startup_dev',
      existing: null,
    });
    loadAdminActionContext.mockResolvedValue({
      ok: true,
      user: { id: 'admin-1' },
      adminDb,
    });

    const { upsertBundleServices } = await import('./actions');
    const formData = new FormData();
    formData.set('bundleKey', 'startup_dev');
    formData.append('serviceId', 'svc-1');
    formData.append('included', 'true');
    formData.append('usageLimit', '12');
    formData.append('serviceId', 'svc-2');
    formData.append('included', 'false');
    formData.append('usageLimit', '99');

    await expect(upsertBundleServices(formData)).rejects.toThrow('NEXT_REDIRECT');

    expect(adminDb.upsertCalls).toHaveLength(1);
    expect(adminDb.upsertCalls[0]?.options).toEqual({
      onConflict: 'bundle_id,service_id',
      ignoreDuplicates: false,
    });
    expect(adminDb.upsertCalls[0]?.rows).toEqual([
      {
        bundle_id: 'bundle-1',
        service_id: 'svc-1',
        enabled: true,
        access_mode: 'free',
        usage_limit: 12,
        metadata: {},
        updated_at: expect.any(String),
      },
      {
        bundle_id: 'bundle-1',
        service_id: 'svc-2',
        enabled: false,
        access_mode: 'off',
        usage_limit: null,
        metadata: {},
        updated_at: expect.any(String),
      },
    ]);
  });

  it('keeps excluded services off and clears usage limits on update', async () => {
    const adminDb = createAdminDbMock({
      bundleId: 'bundle-1',
      bundleKey: 'startup_dev',
      existing: {
        id: 'row-1',
        enabled: true,
        access_mode: 'free',
        usage_limit: 25,
        metadata: {},
      },
    });
    loadAdminActionContext.mockResolvedValue({
      ok: true,
      user: { id: 'admin-1' },
      adminDb,
    });

    const { upsertBundleServices } = await import('./actions');
    const formData = new FormData();
    formData.set('bundleKey', 'startup_dev');
    formData.append('serviceId', 'svc-1');
    formData.append('included', 'false');
    formData.append('usageLimit', '10');

    await expect(upsertBundleServices(formData)).rejects.toThrow('NEXT_REDIRECT');

    expect(adminDb.upsertCalls[0]?.rows).toEqual([
      {
        bundle_id: 'bundle-1',
        service_id: 'svc-1',
        enabled: false,
        access_mode: 'off',
        usage_limit: null,
        metadata: {},
        updated_at: expect.any(String),
      },
    ]);
  });
});
