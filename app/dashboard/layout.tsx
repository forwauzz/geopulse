import { redirect } from 'next/navigation';
import { DashboardSidebar } from '@/components/dashboard-sidebar';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isAdminEmail } from '@/lib/server/require-admin';

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
    <main className="mx-auto w-full max-w-screen-2xl px-6 py-10 md:px-10">
      <div className="grid gap-8 lg:grid-cols-[288px_minmax(0,1fr)]">
        <DashboardSidebar userEmail={user.email ?? null} isAdmin={isAdmin} />
        <div className="min-w-0">{children}</div>
      </div>
    </main>
  );
}
