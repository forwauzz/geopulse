import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { resolvePostSignupRedirect } from '@/lib/server/billing-onboarding-flow';
import { linkGuestPurchasesToUser } from '@/lib/server/link-guest-purchases';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

type CookieRow = { name: string; value: string; options: CookieOptions };

export const dynamic = 'force-dynamic';

function isSafeInternalPath(raw: string | null, fallback: string): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
    return fallback;
  }
  return raw;
}

function buildLoginRedirect(
  appUrl: string,
  args: {
    next: string;
    error?: string | null;
    mode?: string | null;
    bundle?: string | null;
    organizationName?: string | null;
  },
): URL {
  const url = new URL('/login', appUrl);
  url.searchParams.set('next', args.next);
  if (args.mode) {
    url.searchParams.set('mode', args.mode);
  }
  if (args.bundle) {
    url.searchParams.set('bundle', args.bundle);
  }
  if (args.organizationName) {
    url.searchParams.set('organization_name', args.organizationName);
  }
  if (args.error) {
    url.searchParams.set('error', args.error);
  }
  return url;
}

async function buildSupabaseServerClient(url: string, anon: string) {
  const cookieStore = await cookies();
  return createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieRow[]) {
        cookiesToSet.forEach(({ name, value, options }: CookieRow) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
}

export async function GET(request: NextRequest) {
  const url = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const anon = process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
  const serviceKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? request.nextUrl.origin;

  if (!url || !anon) {
    return NextResponse.redirect(new URL('/login?error=config', appUrl));
  }

  const { searchParams } = request.nextUrl;
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const otpType = searchParams.get('type');
  const next = isSafeInternalPath(searchParams.get('next'), '/dashboard');
  const bundle = searchParams.get('bundle');
  const mode = searchParams.get('mode') ?? (bundle ? 'signup' : null);
  const organizationName = searchParams.get('organization_name')?.trim() ?? null;
  const err = searchParams.get('error_description') ?? searchParams.get('error');

  if (err) {
    return NextResponse.redirect(
      buildLoginRedirect(appUrl, { next, error: err, mode, bundle, organizationName }),
    );
  }

  const supabase = await buildSupabaseServerClient(url, anon);

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        buildLoginRedirect(appUrl, {
          next,
          error: error.message || 'session',
          mode,
          bundle,
          organizationName,
        }),
      );
    }
  } else if (tokenHash && otpType === 'email') {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'email',
    });
    if (error) {
      return NextResponse.redirect(
        buildLoginRedirect(appUrl, {
          next,
          error: error.message || 'link-invalid-or-expired',
          mode,
          bundle,
          organizationName,
        }),
      );
    }
  } else {
    return NextResponse.redirect(
      buildLoginRedirect(appUrl, { next, mode, bundle, organizationName }),
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user?.email && serviceKey) {
    const admin = createServiceRoleClient(url, serviceKey);
    await linkGuestPurchasesToUser(admin, user.id, user.email);

    const nameParam = searchParams.get('name')?.trim();
    if (nameParam) {
      await admin.from('users').update({ full_name: nameParam }).eq('id', user.id);
    }

    const { data: userRow } = await admin
      .from('users')
      .select('created_at, plan')
      .eq('id', user.id)
      .maybeSingle();

    const isNewUser =
      userRow != null &&
      Date.now() - new Date(userRow.created_at as string).getTime() < 90_000;

    const redirectPath = resolvePostSignupRedirect({
      nextParam: searchParams.get('next'),
      bundleParam: bundle,
      isNewUser,
      organizationName,
    });
    if (redirectPath) {
      return NextResponse.redirect(new URL(redirectPath, appUrl));
    }
  }

  return NextResponse.redirect(new URL(next, appUrl));
}
