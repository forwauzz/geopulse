import Link from 'next/link';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import { loadEmailCampaignList } from '@/lib/server/email-campaign-console';
import { resolveCampaignSender } from '@/lib/server/email-campaign-sender';

export const dynamic = 'force-dynamic';

function fmt(iso: string | null): string {
  if (!iso) return 'Not scheduled';
  return new Intl.DateTimeFormat('en-CA', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Toronto',
  }).format(new Date(iso));
}

const STATE_STYLE: Record<string, string> = {
  draft: 'bg-surface-container text-on-surface-variant',
  audience_ready: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  content_ready: 'bg-sky-500/15 text-sky-700 dark:text-sky-300',
  qa_ready: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  test_passed: 'bg-violet-500/15 text-violet-700 dark:text-violet-300',
  scheduled: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  running: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  evaluating: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  completed: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  stopped: 'bg-red-500/15 text-red-700 dark:text-red-300',
};

export default async function EmailCampaignsPage() {
  const ctx = await loadAdminPageContext('/admin/campaigns/email');
  if (!ctx.ok) return <p className="text-error">{ctx.message}</p>;

  const env = ctx.env as unknown as Record<string, string | undefined>;
  const campaigns = await loadEmailCampaignList(ctx.adminDb, env);
  const sender = resolveCampaignSender(env);

  return (
    <div className="space-y-6">
      <header className="rounded-3xl bg-on-background p-6 text-background shadow-float md:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.22em] text-primary-fixed">Email campaign control room</p>
        <h1 className="mt-3 font-headline text-3xl font-black md:text-4xl">Campaigns</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-background/70">
          Compose, preview, test, and schedule one email campaign at a time. Contacts, templates, sending, suppression,
          replies, and results stay in the existing systems — this is one place to see them together.
        </p>
        <div className="mt-5 flex flex-wrap gap-2 text-sm">
          <Link href="/admin/outreach" className="rounded-xl bg-background/10 px-4 py-2 font-semibold">Contacts</Link>
          <Link href="/admin/outreach#templates" className="rounded-xl bg-background/10 px-4 py-2 font-semibold">Templates</Link>
          <Link href="/admin/growth-calendar" className="rounded-xl bg-background/10 px-4 py-2 font-semibold">Calendar</Link>
        </div>
      </header>

      {!sender.authenticated ? (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-[20px] text-amber-700 dark:text-amber-300" aria-hidden>lock</span>
            <div>
              <h2 className="font-headline text-base font-bold text-on-background">Sending is unavailable</h2>
              <p className="mt-1 text-sm leading-6 text-on-surface-variant">{sender.blockingReason}</p>
              <p className="mt-2 text-xs leading-5 text-on-surface-variant">
                Campaigns can still be composed, previewed, and reviewed. Scheduling stays disabled until a GEO-Pulse
                sending identity is authenticated — that step needs DNS access and a credential holder.
              </p>
            </div>
          </div>
        </section>
      ) : null}

      <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-float">
        <div className="border-b border-outline-variant/15 px-5 py-4 md:px-6">
          <h2 className="font-headline text-lg font-bold text-on-background">Email campaigns</h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            {campaigns.length} campaign{campaigns.length === 1 ? '' : 's'}
          </p>
        </div>
        {campaigns.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead>
                <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                  <th className="px-5 py-3 md:px-6">Campaign</th>
                  <th className="px-4 py-3">State</th>
                  <th className="px-4 py-3">Recipients</th>
                  <th className="px-4 py-3">First send</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-5 py-3 text-right md:px-6">Open</th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((campaign) => (
                  <tr key={campaign.interventionKey} className="border-t border-outline-variant/15 align-top">
                    <td className="px-5 py-4 md:px-6">
                      <p className="font-semibold text-on-background">{campaign.name}</p>
                      <p className="mt-1 text-xs text-on-surface-variant">
                        {campaign.campaignName} · {campaign.campaignRole} · v{campaign.version}
                        {campaign.locked ? ' · locked' : ''}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${STATE_STYLE[campaign.state] ?? STATE_STYLE.draft}`}>
                        {campaign.state.replaceAll('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-on-surface-variant">
                      {campaign.recipientCount === null ? 'Not frozen' : campaign.recipientCount}
                    </td>
                    <td className="px-4 py-4 text-on-surface-variant">{fmt(campaign.startAt)}</td>
                    <td className="px-4 py-4 capitalize text-on-surface-variant">{campaign.owner}</td>
                    <td className="px-5 py-4 text-right md:px-6">
                      <Link href={`/admin/campaigns/email/${campaign.interventionKey}`} className="font-semibold text-primary hover:underline">
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-6 py-10 text-center text-sm text-on-surface-variant">
            No email campaign has been composed yet.
          </p>
        )}
      </section>
    </div>
  );
}
