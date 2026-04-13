import { redirect } from 'next/navigation';
import { DashboardShell } from '@/components/dashboard-shell';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { resolveDashboardShellIsAdmin } from '@/lib/server/dashboard-shell-admin';
import { isUserPlatformAdmin } from '@/lib/server/require-admin';
import { signOut } from './actions';

export const dynamic = 'force-dynamic';

export default async function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login?next=/dashboard');
  }

  const isPlatformAdmin = await isUserPlatformAdmin(user.id);
  const isAdmin = resolveDashboardShellIsAdmin(isPlatformAdmin);

  return (
    <main className="mx-auto w-full max-w-screen-2xl px-4 py-8 sm:px-6 md:px-10">
      <DashboardShell userEmail={user.email ?? null} isAdmin={isAdmin} signOutAction={signOut}>
        {children}
      </DashboardShell>
    </main>
  );
}
