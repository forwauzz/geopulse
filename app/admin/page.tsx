import Link from 'next/link';

export const dynamic = 'force-dynamic';

type QuickLinkProps = {
  readonly href: string;
  readonly icon: string;
  readonly label: string;
  readonly description: string;
};

function QuickLink({ href, icon, label, description }: QuickLinkProps) {
  return (
    <Link
      href={href}
      className="flex items-start gap-4 rounded-2xl border border-outline-variant/10 bg-surface-container-lowest px-5 py-4 transition hover:bg-surface-container-low"
    >
      <span
        className="material-symbols-outlined shrink-0 text-[28px] text-on-surface-variant mt-0.5"
        aria-hidden
      >
        {icon}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-on-background">{label}</p>
        <p className="mt-0.5 text-xs text-on-surface-variant">{description}</p>
      </div>
    </Link>
  );
}

const QUICK_LINKS: QuickLinkProps[] = [
  {
    href: '/admin/agencies',
    icon: 'corporate_fare',
    label: 'Agencies',
    description: 'Manage agency accounts, clients, entitlements, and scan access.',
  },
  {
    href: '/admin/startups',
    icon: 'rocket_launch',
    label: 'Startups',
    description: 'Manage startup workspaces, bundles, rollout flags, and service gates.',
  },
  {
    href: '/admin/services',
    icon: 'tune',
    label: 'Services',
    description: 'Configure service catalog, bundles, and entitlement overrides.',
  },
  {
    href: '/dashboard/content',
    icon: 'article',
    label: 'Content',
    description: 'Editorial pipeline: drafts, publish, launch readiness, batch controls.',
  },
  {
    href: '/dashboard/benchmarks',
    icon: 'analytics',
    label: 'Benchmarks',
    description: 'Run and review AI benchmark comparisons across domains.',
  },
  {
    href: '/admin/logs',
    icon: 'receipt_long',
    label: 'System Logs',
    description: 'Filter and inspect system events, delivery failures, and errors.',
  },
  {
    href: '/dashboard/distribution',
    icon: 'share',
    label: 'Distribution',
    description: 'Manage distribution accounts, OAuth, assets, and dispatch jobs.',
  },
  {
    href: '/dashboard/evals',
    icon: 'science',
    label: 'Evals',
    description: 'Eval analytics and model quality measurement.',
  },
];

export default function AdminConsolePage() {
  return (
    <section className="space-y-8">

      {/* ── Page header ─────────────────────────────────────── */}
      <div>
        <p className="text-[10px] font-bold uppercase tracking-widest text-amber-600 dark:text-amber-400">
          Admin Console
        </p>
        <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">
          Console Home
        </h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          Platform operator tools — not visible to end users. All changes here affect production data.
        </p>
      </div>

      {/* ── Notice ──────────────────────────────────────────── */}
      <div className="flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 px-5 py-4">
        <span
          className="material-symbols-outlined shrink-0 text-[20px] text-amber-600 dark:text-amber-400"
          aria-hidden
        >
          warning
        </span>
        <div>
          <p className="text-sm font-semibold text-on-background">Operator-only access</p>
          <p className="mt-0.5 text-xs text-on-surface-variant">
            You are viewing the admin console. Actions here modify live platform data including
            billing configurations, service entitlements, and workspace settings.
          </p>
        </div>
      </div>

      {/* ── Quick-access grid ────────────────────────────────── */}
      <div>
        <h2 className="mb-4 font-headline text-lg font-semibold text-on-background">
          Platform sections
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
          {QUICK_LINKS.map((link) => (
            <QuickLink key={link.href} {...link} />
          ))}
        </div>
      </div>

      {/* ── Admin notes ─────────────────────────────────────── */}
      <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low px-6 py-5">
        <h2 className="font-headline text-base font-semibold text-on-background">
          Migration notes
        </h2>
        <ul className="mt-3 space-y-2 text-sm text-on-surface-variant">
          <li className="flex items-start gap-2">
            <span className="material-symbols-outlined shrink-0 text-[14px] text-on-surface-variant mt-0.5" aria-hidden>
              info
            </span>
            Admin pages are currently at <code className="font-mono text-xs">/dashboard/*</code>.
            They will progressively move to <code className="font-mono text-xs">/admin/*</code> in subsequent UX tasks (UXIA-009–011).
          </li>
          <li className="flex items-start gap-2">
            <span className="material-symbols-outlined shrink-0 text-[14px] text-on-surface-variant mt-0.5" aria-hidden>
              info
            </span>
            The admin console is gated by the <code className="font-mono text-xs">platform_admin_users</code>{' '}
            table. Only seeded platform admins can access these pages.
          </li>
        </ul>
      </div>

    </section>
  );
}
