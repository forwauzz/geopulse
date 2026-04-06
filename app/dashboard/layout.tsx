import { redirect } from 'next/navigation';
import { DashboardSidebar } from '@/components/dashboard-sidebar';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/server/require-admin';
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

  const isAdmin = isAdminEmail(user.email);

  return (
    <main className="mx-auto w-full max-w-screen-2xl px-4 py-8 sm:px-6 md:px-10">
      <div className="grid gap-6 lg:grid-cols-[288px_minmax(0,1fr)] lg:gap-8">
        <DashboardSidebar
          userEmail={user.email ?? null}
          isAdmin={isAdmin}
          signOutAction={signOut}
        />
        <div className="min-w-0">{children}</div>
      </div>
    </main>
  );
}
