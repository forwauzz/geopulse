import { beforeEach, describe, expect, it, vi } from 'vitest';

const redirectMock = vi.fn((url: string) => {
  throw new Error(`redirect:${url}`);
});

vi.mock('next/navigation', () => ({
  redirect: (url: string) => redirectMock(url),
}));

const signInWithOtp = vi.fn();
const signInWithPassword = vi.fn();
const createUser = vi.fn();
const updateUserRows = vi.fn();
const updateUserRowsEq = vi.fn();
const createServiceRoleClient = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      signInWithOtp,
      signInWithPassword,
    },
  })),
}));

vi.mock('@/lib/supabase/service-role', () => ({
  createServiceRoleClient: (...args: unknown[]) => createServiceRoleClient(...args),
}));

describe('login actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://getgeopulse.com');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');
    createServiceRoleClient.mockImplementation(() => ({
      auth: {
        admin: {
          createUser,
        },
      },
      from: vi.fn(() => ({
        update: updateUserRows,
      })),
    }));
    updateUserRows.mockReturnValue({
      eq: updateUserRowsEq,
    });
    updateUserRowsEq.mockResolvedValue({ error: null });
  });

  it('preserves signup bundle context in the magic-link redirect', async () => {
    signInWithOtp.mockResolvedValue({ error: null });

    const { sendMagicLink } = await import('./actions');
    const formData = new FormData();
    formData.set('email', 'uzzielt@techehealthservices.com');
    formData.set('next', '/pricing');
    formData.set('mode', 'signup');
    formData.set('bundle', 'startup_dev');
    formData.set('full_name', 'Uzziel Tamon');

    const result = await sendMagicLink(null, formData);

    expect(result).toEqual({
      ok: true,
      message: 'Check your email for the sign-in link.',
    });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: 'uzzielt@techehealthservices.com',
      options: {
        emailRedirectTo:
          'https://getgeopulse.com/auth/callback?next=%2Fpricing&mode=signup&bundle=startup_dev&name=Uzziel+Tamon',
      },
    });
  });

  it('creates a password account, signs in, and resumes the selected bundle', async () => {
    createUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
    signInWithPassword.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });

    const { signUpWithPassword } = await import('./actions');
    const formData = new FormData();
    formData.set('full_name', 'Uzziel Tamon');
    formData.set('email', 'uzzielt@techehealthservices.com');
    formData.set('password', 'password123');
    formData.set('confirm_password', 'password123');
    formData.set('next', '/pricing');
    formData.set('bundle', 'startup_dev');

    await expect(signUpWithPassword(null, formData)).rejects.toThrow(
      'redirect:/pricing?bundle=startup_dev&autosubscribe=1'
    );

    expect(createUser).toHaveBeenCalledWith({
      email: 'uzzielt@techehealthservices.com',
      password: 'password123',
      email_confirm: true,
      user_metadata: { full_name: 'Uzziel Tamon' },
    });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'uzzielt@techehealthservices.com',
      password: 'password123',
    });
    expect(updateUserRows).toHaveBeenCalledWith({ full_name: 'Uzziel Tamon' });
  });

  it('resumes the selected bundle when an existing user signs in with password', async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: { id: 'user-2' } },
      error: null,
    });

    const { signInWithPassword: signInAction } = await import('./actions');
    const formData = new FormData();
    formData.set('email', 'uzzielt@techehealthservices.com');
    formData.set('password', 'password123');
    formData.set('next', '/pricing');
    formData.set('bundle', 'agency_core');

    await expect(signInAction(null, formData)).rejects.toThrow(
      'redirect:/pricing?bundle=agency_core&autosubscribe=1'
    );

    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'uzzielt@techehealthservices.com',
      password: 'password123',
    });
  });

  it('rejects signup when passwords do not match', async () => {
    const { signUpWithPassword } = await import('./actions');
    const formData = new FormData();
    formData.set('full_name', 'Uzziel Tamon');
    formData.set('email', 'uzzielt@techehealthservices.com');
    formData.set('password', 'password123');
    formData.set('confirm_password', 'password456');
    formData.set('next', '/pricing');
    formData.set('bundle', 'startup_dev');

    const result = await signUpWithPassword(null, formData);

    expect(result).toEqual({
      ok: false,
      message: 'Passwords do not match.',
    });
    expect(createUser).not.toHaveBeenCalled();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
