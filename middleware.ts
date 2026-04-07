import { NextResponse, type NextRequest } from 'next/server';
import { shouldRejectForMiddlewareSubrequest } from '@/lib/server/middleware-cve';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Defense in depth for CVE-2025-29927: reject forged internal middleware headers at the edge.
 * Next.js 15.2.3+ is patched; this remains a belt-and-suspenders check (see `ORCHESTRATOR.md`).
 */
const ANON_COOKIE = 'gp_anon_id';
const ANON_MAX_AGE = 365 * 24 * 60 * 60; // 1 year

function ensureAnonymousId(request: NextRequest, response: NextResponse): void {
  if (request.cookies.has(ANON_COOKIE)) return;
  response.cookies.set(ANON_COOKIE, crypto.randomUUID(), {
    httpOnly: false,
    secure: true,
    sameSite: 'lax',
    maxAge: ANON_MAX_AGE,
    path: '/',
  });
}

export async function middleware(request: NextRequest) {
  if (shouldRejectForMiddlewareSubrequest(request.headers)) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const { response, userId } = await updateSession(request);

  ensureAnonymousId(request, response);

  const { pathname } = request.nextUrl;

  // Guard: /dashboard requires authentication
  if (pathname.startsWith('/dashboard') && !userId) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', `${pathname}${request.nextUrl.search}`);
    const redirect = NextResponse.redirect(login);
    ensureAnonymousId(request, redirect);
    return redirect;
  }

  // Guard: /admin/* (except /admin/login) requires an authenticated session.
  // The full DB-backed admin check happens inside app/admin/layout.tsx —
  // this gate only prevents completely unauthenticated users from hitting admin routes.
  if (pathname.startsWith('/admin') && !pathname.startsWith('/admin/login') && !userId) {
    const adminLogin = new URL('/admin/login', request.url);
    const redirect = NextResponse.redirect(adminLogin);
    ensureAnonymousId(request, redirect);
    return redirect;
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
