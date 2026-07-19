import { signOut } from '@/app/dashboard/actions';
import { isUserPlatformAdmin } from '@/lib/server/require-admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { SiteHeaderShell } from '@/components/site-header-shell';
import { loadUiFlags } from '@/lib/server/app-ui-flags';

export async function SiteHeader() {
  let userEmail: string | null = null;
  let userId: string | null = null;
  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userEmail = user?.email ?? null;
    userId = user?.id ?? null;
  } catch {
    userEmail = null;
    userId = null;
  }

  const isSignedIn = !!userEmail;
  const isAdmin = userId ? await isUserPlatformAdmin(userId) : false;
  const flags = await loadUiFlags();

  return (
    <SiteHeaderShell
      isSignedIn={isSignedIn}
      isAdmin={isAdmin}
      showPricing={flags.show_pricing}
      showAboutNav={flags.show_about_nav}
      showFreeTrial={flags.show_free_trial}
      showBlog={flags.show_blog}
      signOutButton={
        isSignedIn ? (
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary transition-opacity hover:opacity-90 sm:px-5"
            >
              Sign out
            </button>
          </form>
        ) : null
      }
    />
  );
}
