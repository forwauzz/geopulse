/**
 * Guarded shell for the admin console.
 *
 * This lives in a `(console)` route group — which does NOT affect URLs — so that `/admin/login`
 * can sit at `app/admin/login` OUTSIDE this layout. Do not move the login page under here: this
 * layout redirects unauthenticated visitors to `/admin/login`, so if that page were also wrapped
 * by it, the redirect target would re-run the same guard and 307 to itself forever. That exact
 * loop shipped to production on 2026-04-08 and locked every logged-out operator out of admin
 * until 2026-07-20. `middleware.ts` already excludes `/admin/login` for the same reason.
 *
 * Covered by the "admin login page renders the operator password flow" smoke test.
 */
import { redirect } from 'next/navigation';
import { AdminSidebar } from '@/components/admin-sidebar';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isUserPlatformAdmin } from '@/lib/server/require-admin';
import { getScanApiEnv } from '@/lib/server/cf-env';

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

  // DB-backed platform admin check.
  const isAdmin = await isUserPlatformAdmin(user.id);
  if (!isAdmin) {
    redirect('/dashboard');
  }

  const env = await getScanApiEnv();
  const automationEnabled = env.AUTOMATION_CONSOLE_ENABLED?.trim().toLowerCase() === 'true';

  return (
    <main className="mx-auto w-full max-w-screen-2xl px-4 py-8 sm:px-6 md:px-10">
      <div className="grid gap-6 lg:grid-cols-[256px_minmax(0,1fr)] lg:gap-8">

        {/* ── Admin sidebar (client component — handles mobile hamburger) */}
        <AdminSidebar automationEnabled={automationEnabled} />

        {/* ── Main content ───────────────────────────────────── */}
        <div className="min-w-0">{children}</div>

      </div>
    </main>
  );
}
