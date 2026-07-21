'use client';

/**
 * "Your next 90 days" (spec C11) — the dated sequence + re-scan hook, shown at the end
 * of the results page. Dates anchor to when this scan ran.
 */

type Phase = { date: string; title: string; actions: string[] };

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0] ?? '';
}

const PHASES: Phase[] = [
  {
    date: addDays(0),
    title: 'Now — unblock access and validate',
    actions: [
      'Apply the access fixes above (robots.txt, firewall safelist, noindex/nosnippet).',
      'Confirm real index status in Google Search Console and Bing Webmaster Tools.',
    ],
  },
  {
    date: addDays(14),
    title: 'Day 14 — re-scan and confirm retrieval',
    actions: ['Re-run this scan and confirm every destination reads Eligible.', 'Re-check Search Console and Bing.'],
  },
  {
    date: addDays(30),
    title: 'Day 30 — profiles, schema, and key pages',
    actions: [
      'Complete Google Business Profile and Bing Places; fix directory listings.',
      'Ship LocalBusiness/FAQPage schema; restructure top service pages answer-first.',
    ],
  },
  {
    date: addDays(60),
    title: 'Day 60 — buyer-question content',
    actions: ['Publish pages answering real buyer questions (pricing, comparisons).', 'Add proof: case studies, certifications, named people.'],
  },
  {
    date: addDays(90),
    title: 'Day 90 — measure against this baseline',
    actions: ['Re-run the scan and compare with today.', 'Ask ChatGPT/Claude/Perplexity your top 5 buyer questions — are you cited?'],
  },
];

export function CadencePlanCard() {
  return (
    <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-6">
      <p className="font-label text-xs uppercase tracking-[0.22em] text-on-surface-variant">The plan</p>
      <h2 className="mt-2 font-headline text-xl font-bold text-on-background">Your next 90 days</h2>
      <ol className="mt-4 space-y-4">
        {PHASES.map((phase) => (
          <li key={phase.date} className="rounded-xl bg-surface-container-low p-4">
            <p className="font-body text-sm font-semibold text-on-background">
              <span className="text-primary">{phase.date}</span> — {phase.title}
            </p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 font-body text-sm leading-6 text-on-surface-variant">
              {phase.actions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <a
        href="/"
        className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-body text-sm font-semibold text-on-primary transition hover:opacity-90"
      >
        <span className="material-symbols-outlined text-base" aria-hidden>event_repeat</span>
        Re-scan at your next checkpoint
      </a>
    </section>
  );
}
