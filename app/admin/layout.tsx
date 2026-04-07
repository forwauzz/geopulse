import { redirect } from 'next/navigation';
import { AdminSidebar } from '@/components/admin-sidebar';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isAdminEmail, isUserPlatformAdmin } from '@/lib/server/require-admin';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/admin/login');
  }

  // DB-backed admin check (primary). Legacy ADMIN_EMAIL env var as fallback.
  const isAdmin = await isUserPlatformAdmin(user.id);
  if (!isAdmin && !isAdminEmail(user.email)) {
    redirect('/dashboard');
  }

  return (
    <main className="mx-auto w-full max-w-screen-2xl px-4 py-8 sm:px-6 md:px-10">
      <div className="grid gap-6 lg:grid-cols-[256px_minmax(0,1fr)] lg:gap-8">

        {/* ── Admin sidebar (client component — handles mobile hamburger) */}
        <AdminSidebar />

        {/* ── Main content ───────────────────────────────────── */}
        <div className="min-w-0">{children}</div>

      </div>
    </main>
  );
}
