import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { getScanApiEnv } from '@/lib/server/cf-env';
import { DashboardScanHero } from '@/components/dashboard-scan-hero';
import { getTurnstileSiteKey } from '@/lib/turnstile-site-key';

export const dynamic = 'force-dynamic';

const VALUE_STRIP = [
  { img: '/media/journey-cards.webp', label: 'See', body: 'Where AI includes you today' },
  { img: '/media/browser-journey.webp', label: 'Fix', body: 'What to change first' },
  { img: '/media/extract-flow.webp', label: 'Prove', body: 'Track it improving over time' },
] as const;

/**
 * Logged-in home = just the search box, dressed to feel like a marketing tool (living hero visual
 * + a simple See/Fix/Prove strip). Everything else lives under /dashboard/history.
 */
export default async function DashboardHomePage({
  searchParams,
}: {
  searchParams?: Promise<{ url?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard');

  // Attribute scans to the user's first startup workspace, if any.
  let startupWorkspaceId: string | null = null;
  const env = await getScanApiEnv();
  if (env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const admin = createServiceRoleClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
      const { data } = await admin
        .from('startup_workspace_users')
        .select('startup_workspace_id')
        .eq('user_id', user.id)
        .limit(1)
        .maybeSingle();
      startupWorkspaceId = (data?.startup_workspace_id as string | undefined) ?? null;
    } catch {
      startupWorkspaceId = null;
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-1 py-6 sm:py-10">
      {/* Search box — the whole point of the home screen */}
      <DashboardScanHero
        siteKey={getTurnstileSiteKey()}
        defaultUrl={sp.url}
        agencyAccountId={null}
        agencyClientId={null}
        startupWorkspaceId={startupWorkspaceId}
        scanDisabled={false}
        startupAccessBlocked={false}
        contextLine={null}
      />

      {/* Living hero visual */}
      <div className="relative mt-8 overflow-hidden rounded-3xl border border-outline-variant/25 bg-surface-container-lowest shadow-float">
        <video
          className="block h-auto w-full"
          src="/media/hero-pulse.mp4"
          poster="/media/hero-pulse-poster.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-label="A connected globe lights up and a heartbeat pulse sweeps across it — your AI visibility, live."
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-surface-container-lowest/95 to-transparent" aria-hidden />
      </div>

      {/* Simple, responsive See / Fix / Prove strip */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {VALUE_STRIP.map((v) => (
          <div key={v.label} className="overflow-hidden rounded-2xl border border-outline-variant/25 bg-surface-container-lowest shadow-float">
            <img src={v.img} alt="" className="block h-28 w-full object-cover" loading="lazy" decoding="async" />
            <div className="p-4">
              <p className="font-sans text-sm font-black uppercase tracking-tight text-on-background">{v.label}</p>
              <p className="mt-0.5 font-sans text-xs text-on-surface-variant">{v.body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
