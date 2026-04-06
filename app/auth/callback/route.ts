import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

type CookieRow = { name: string; value: string; options: CookieOptions };
import { linkGuestPurchasesToUser } from '@/lib/server/link-guest-purchases';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export const dynamic = 'force-dynamic';

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
  const nextRaw = searchParams.get('next') ?? '/dashboard';
  const next =
    nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/dashboard';
  const err = searchParams.get('error_description') ?? searchParams.get('error');

  if (err) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(err)}`, appUrl)
    );
  }

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(url, anon, {
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

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL('/login?error=session', appUrl));
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user?.email && serviceKey) {
      const admin = createServiceRoleClient(url, serviceKey);
      await linkGuestPurchasesToUser(admin, user.id, user.email);

      // ── New-user detection (BILL-006) ───────────────────────────────────────
      // Detect first-time sign-in by checking how recently the user row was created.
      // `created_at` is written on first OAuth/magic-link login by our upsert trigger.
      const { data: userRow } = await admin
        .from('users')
        .select('created_at, plan')
        .eq('id', user.id)
        .maybeSingle();

      const isNewUser =
        userRow != null &&
        Date.now() - new Date(userRow.created_at as string).getTime() < 90_000; // 90s window

      const nextParam = searchParams.get('next');
      const bundleParam = searchParams.get('bundle');

      // If user came from pricing CTA before they were logged in → resume subscribe
      if (bundleParam && nextParam === '/pricing') {
        return NextResponse.redirect(
          new URL(`/pricing?bundle=${encodeURIComponent(bundleParam)}&autosubscribe=1`, appUrl)
        );
      }

      // New user with no explicit next destination → send to pricing to pick a bundle
      if (isNewUser && !nextParam) {
        return NextResponse.redirect(new URL('/pricing?onboarding=1', appUrl));
      }
      // ── End BILL-006 ────────────────────────────────────────────────────────
    }

    return NextResponse.redirect(new URL(next, appUrl));
  }

  return NextResponse.redirect(new URL('/login', appUrl));
}
