import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { resolveE2EAuthUserFromCookieValue } from '@/lib/supabase/e2e-auth';

type CookieRow = { name: string; value: string; options: CookieOptions };

type SessionResult = {
  readonly response: NextResponse;
  readonly userId: string | null;
  /** Present when `userId` is set (Supabase user email or E2E fixture). */
  readonly userEmail: string | null;
};

/**
 * Refresh Supabase session from cookies; attach updated cookies to the response.
 */
export async function updateSession(request: NextRequest): Promise<SessionResult> {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const e2eUser = resolveE2EAuthUserFromCookieValue(request.cookies.get('gp_e2e_auth')?.value);
  if (e2eUser) {
    return { response: supabaseResponse, userId: e2eUser.id, userEmail: e2eUser.email };
  }

  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const anon = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  if (!url || !anon) {
    return { response: supabaseResponse, userId: null, userEmail: null };
  }

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieRow[]) {
        cookiesToSet.forEach(({ name, value }: CookieRow) => {
          request.cookies.set(name, value);
        });
        supabaseResponse = NextResponse.next({
          request,
        });
        cookiesToSet.forEach(({ name, value, options }: CookieRow) => {
          supabaseResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return {
    response: supabaseResponse,
    userId: user?.id ?? null,
    userEmail: user?.email ?? null,
  };
}
