import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getAdminPageContext } from '@/lib/server/admin-page-context-cache';
import { ADMIN_PAGE_CONTEXT_MISCONFIGURED_MESSAGE } from '@/lib/server/admin-runtime';

export const dynamic = 'force-dynamic';

export default async function DashboardAdminGroupLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const h = await headers();
  const nextPath = h.get('x-pathname') ?? '/dashboard';
  const adminContext = await getAdminPageContext(nextPath);
  if (!adminContext.ok) {
    if (adminContext.message === ADMIN_PAGE_CONTEXT_MISCONFIGURED_MESSAGE) {
      return (
        <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 md:py-16">
          <p className="text-error">{adminContext.message}</p>
        </main>
      );
    }
    redirect('/dashboard');
  }

  return <>{children}</>;
}
