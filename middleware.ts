import { NextResponse, type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

/**
 * Defense in depth for CVE-2025-29927: reject forged internal middleware headers at the edge.
 * Next.js 15.2.3+ is patched; this remains a belt-and-suspenders check (see `ORCHESTRATOR.md`).
 */
export async function middleware(request: NextRequest) {
  if (request.headers.has('x-middleware-subrequest')) {
    return new NextResponse('Forbidden', { status: 403 });
  }

  const { response, userId } = await updateSession(request);

  if (request.nextUrl.pathname.startsWith('/dashboard') && !userId) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
