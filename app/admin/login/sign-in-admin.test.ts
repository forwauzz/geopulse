import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirectMock = vi.fn((url: string) => {
  throw new Error(`redirect:${url}`);
});

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

const signInWithPassword = vi.fn();
const signOut = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      signInWithPassword,
      signOut,
    },
  })),
}));

const isUserPlatformAdmin = vi.fn();

vi.mock('@/lib/server/require-admin', () => ({
  isUserPlatformAdmin: (id: string) => isUserPlatformAdmin(id),
}));

describe('signInAdminWithPassword', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    signOut.mockResolvedValue({});
  });

  it('rejects non-admin accounts', async () => {
    isUserPlatformAdmin.mockResolvedValue(false);
    signInWithPassword.mockResolvedValue({
      data: { user: { id: 'u1', email: 'admin@example.com' } },
      error: null,
    });

    const { signInAdminWithPassword } = await import('./actions');
    const fd = new FormData();
    fd.set('email', 'admin@example.com');
    fd.set('password', 'password123');
    const result = await signInAdminWithPassword(null, fd);
    expect(result.ok).toBe(false);
    expect(signOut).toHaveBeenCalled();
  });

  it('allows DB platform admin', async () => {
    isUserPlatformAdmin.mockResolvedValue(true);
    signInWithPassword.mockResolvedValue({
      data: { user: { id: 'u2', email: 'ops@example.com' } },
      error: null,
    });

    const { signInAdminWithPassword } = await import('./actions');
    const fd = new FormData();
    fd.set('email', 'ops@example.com');
    fd.set('password', 'password123');
    await expect(signInAdminWithPassword(null, fd)).rejects.toThrow('redirect:/dashboard');
    expect(signOut).not.toHaveBeenCalled();
  });

  it('signs out when DB platform admin is false', async () => {
    isUserPlatformAdmin.mockResolvedValue(false);
    signInWithPassword.mockResolvedValue({
      data: { user: { id: 'u3', email: 'user@example.com' } },
      error: null,
    });

    const { signInAdminWithPassword } = await import('./actions');
    const fd = new FormData();
    fd.set('email', 'user@example.com');
    fd.set('password', 'password123');
    const result = await signInAdminWithPassword(null, fd);
    expect(result.ok).toBe(false);
    expect(signOut).toHaveBeenCalled();
  });
});
