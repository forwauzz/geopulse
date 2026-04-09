import { beforeEach, describe, expect, it, vi } from 'vitest';

const signInWithOtp = vi.fn();
const signInWithPassword = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createSupabaseServerClient: vi.fn(async () => ({
    auth: {
      signInWithOtp,
      signInWithPassword,
    },
  })),
}));

describe('login actions', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://getgeopulse.com');
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
});
