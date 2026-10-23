import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { createServiceRoleClientMock, selectMock } = vi.hoisted(() => ({
  createServiceRoleClientMock: vi.fn(),
  selectMock: vi.fn(),
}));

vi.mock('next/cache', () => ({
  unstable_cache: (fn: unknown) => fn,
  updateTag: vi.fn(),
}));

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: createServiceRoleClientMock,
}));

import { UI_FLAG_DEFAULTS, loadUiFlagSnapshot, loadUiFlags } from './app-ui-flags';

describe('app UI flag reads', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-key');
    createServiceRoleClientMock.mockReturnValue({
      from: vi.fn(() => ({ select: selectMock })),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('distinguishes an unreadable flag store from an intentional false flag', async () => {
    selectMock.mockResolvedValue({ data: null, error: new Error('database unavailable') });

    await expect(loadUiFlagSnapshot()).resolves.toEqual({
      flags: UI_FLAG_DEFAULTS,
      status: 'unavailable',
    });
  });

  it('marks a successful read as loaded and preserves stored values', async () => {
    selectMock.mockResolvedValue({ data: [{ key: 'show_pricing', enabled: true }], error: null });

    await expect(loadUiFlagSnapshot()).resolves.toMatchObject({
      flags: { show_pricing: true },
      status: 'loaded',
    });
    await expect(loadUiFlags()).resolves.toMatchObject({ show_pricing: true });
  });

  it('reports missing server configuration as unavailable without opening a client', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', undefined);

    await expect(loadUiFlagSnapshot()).resolves.toEqual({
      flags: UI_FLAG_DEFAULTS,
      status: 'unavailable',
    });
    expect(createServiceRoleClientMock).not.toHaveBeenCalled();
  });
});
