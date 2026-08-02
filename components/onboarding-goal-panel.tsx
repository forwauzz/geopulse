import Link from 'next/link';
import type { OnboardingGoal, OnboardingRole } from '@/lib/server/onboarding-profile';

const experiences = {
  visibility: {
    label: 'Your priority · AI visibility',
    icon: 'monitoring',
    title: 'See where your brand appears in AI answers',
    description:
      'Track the buyer questions that matter, the engines mentioning you, and the pages most likely to improve your visibility.',
    href: '/dashboard/visibility',
    cta: 'Open AI visibility',
  },
  competitors: {
    label: 'Your priority · Competitors',
    icon: 'leaderboard',
    title: 'Find who wins the buyer questions before you do',
    description:
      'Compare visibility, citations, and content gaps so your next action is tied to a competitor you can overtake.',
    href: '/dashboard/visibility',
    cta: 'View competitor insights',
  },
  reports: {
    label: 'Your priority · Reporting',
    icon: 'description',
    title: 'Turn measured progress into proof people can share',
    description:
      'Keep the latest results, priority actions, and client-ready reporting in one repeatable workflow.',
    href: '/dashboard/history',
    cta: 'Open reports',
  },
} as const;

export function OnboardingGoalPanel({
  goal,
  role,
  firstValue = false,
}: {
  readonly goal: OnboardingGoal;
  readonly role: OnboardingRole;
  readonly firstValue?: boolean;
}) {
  const experience = experiences[goal];
  const href = goal === 'reports' && role === 'agency' ? '/dashboard/clients' : experience.href;
  const cta = firstValue
    ? role === 'agency' ? 'Add the first client' : 'See the first visibility baseline'
    : goal === 'reports' && role === 'agency' ? 'Set up client reporting' : experience.cta;

  return (
    <section className="overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-surface-container-lowest to-tertiary/10 p-5 shadow-float md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="max-w-2xl">
          <p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
            <span className="material-symbols-outlined text-[18px]" aria-hidden>
              {experience.icon}
            </span>
            {firstValue ? 'Your first useful view' : experience.label}
          </p>
          <h2 className="mt-3 font-headline text-2xl font-bold text-on-background">
            {firstValue ? 'Your business and market are confirmed' : experience.title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
            {firstValue
              ? 'GEO-Pulse now uses the same confirmed context for buyer questions, competitors, reports, and recurring monitoring. Start with the one action below.'
              : experience.description}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={href}
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-on-primary transition hover:bg-primary-dim"
          >
            {cta}
            <span className="material-symbols-outlined text-[18px]" aria-hidden>
              arrow_forward
            </span>
          </Link>
          <Link
            href="/dashboard/workspace#experience-preferences"
            className="inline-flex items-center rounded-xl border border-outline-variant/25 bg-surface-container-lowest px-4 py-2.5 text-sm font-semibold text-on-background"
          >
            Change priority
          </Link>
        </div>
      </div>
    </section>
  );
}
