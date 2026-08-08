import Link from 'next/link';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import {
  loadEmailCampaignComposerOptions,
  loadEmailCampaignList,
  type EmailCampaignSegmentOption,
} from '@/lib/server/email-campaign-console';
import { resolveCampaignSender } from '@/lib/server/email-campaign-sender';
import { PRESET_OUTREACH_TEMPLATES } from '@/lib/server/outreach-templates';
import { createEmailCampaignAction, importCampaignContactsAction } from './actions';

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

function campaignSegments(vertical: string, segments: readonly EmailCampaignSegmentOption[]) {
  const pattern = vertical === 'msp_it_services' ? /(^|-)msp(s)?($|-)/i : /marketing-agenc/i;
  return segments.filter((segment) => pattern.test(segment.segment));
}

function draftKey(campaignKey: string): string {
  return `${campaignKey}-email-pilot-v1`.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
}

export default async function EmailCampaignsPage({
  searchParams,
}: {
  readonly searchParams?: Promise<{
    error?: string;
    contactsHeld?: string;
    contactsSkipped?: string;
    contactsInvalid?: string;
    contactsError?: string;
  }>;
}) {
  const ctx = await loadAdminPageContext('/admin/campaigns/email');
  if (!ctx.ok) return <p className="text-error">{ctx.message}</p>;

  const env = ctx.env as unknown as Record<string, string | undefined>;
  const [campaigns, composer] = await Promise.all([
    loadEmailCampaignList(ctx.adminDb, env),
    loadEmailCampaignComposerOptions(ctx.adminDb),
  ]);
  const sender = resolveCampaignSender(env);
  const query = (await searchParams) ?? {};
  const mspPreset = PRESET_OUTREACH_TEMPLATES.find((template) => template.key === 'msp-evidence-first')!;
  const agencyPreset = PRESET_OUTREACH_TEMPLATES.find((template) => template.key === 'first-scorecard')!;

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

      {query.error ? (
        <p role="alert" className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-700 dark:text-red-300">
          The draft was not created ({query.error.replaceAll('_', ' ')}). No audience was frozen and nothing was sent.
        </p>
      ) : null}

      <section aria-label="Campaign workflow" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['1', 'Contacts', 'Import and review a held audience'],
          ['2', 'Campaign', 'Choose name, segment, and message'],
          ['3', 'Preview & test', 'Confirm the exact rendered email'],
          ['4', 'Schedule', 'Release only after every gate passes'],
        ].map(([step, label, detail]) => (
          <div key={step} className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-4">
            <p className="text-xs font-bold uppercase tracking-wider text-primary">Step {step}</p>
            <p className="mt-1 font-headline text-base font-bold text-on-background">{label}</p>
            <p className="mt-1 text-xs leading-5 text-on-surface-variant">{detail}</p>
          </div>
        ))}
      </section>

      <details id="import-contacts" open={query.contactsHeld !== undefined || Boolean(query.contactsError)} className="group rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-float">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-5 md:p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Audience</p>
            <h2 className="mt-1 font-headline text-xl font-bold text-on-background">Import contacts</h2>
            <p className="mt-1 text-sm text-on-surface-variant">CSV in, held contact bank out. No enrollment and no send.</p>
          </div>
          <span className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary">Upload CSV</span>
        </summary>
        <div className="border-t border-outline-variant/15 p-5 md:p-6">
          {query.contactsHeld !== undefined ? (
            <p className="mb-4 rounded-xl bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800 dark:text-emerald-200">
              Held {query.contactsHeld} new contact{query.contactsHeld === '1' ? '' : 's'} · {query.contactsSkipped ?? '0'} already saved · {query.contactsInvalid ?? '0'} unusable row{query.contactsInvalid === '1' ? '' : 's'}. Nothing was sent.
            </p>
          ) : null}
          {query.contactsError ? (
            <p role="alert" className="mb-4 rounded-xl bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
              Import needs attention: {query.contactsError.replaceAll('_', ' ')}.
            </p>
          ) : null}
          <form action={importCampaignContactsAction} className="grid gap-4 md:grid-cols-2">
            <label className="block md:col-span-2">
              <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Contact CSV</span>
              <input name="file" type="file" accept=".csv,text/csv" required className="mt-1 block w-full rounded-xl border border-dashed border-outline-variant/40 bg-surface-container-low px-4 py-5 text-sm" />
              <span className="mt-1 block text-xs text-on-surface-variant">Apollo exports are recognized automatically. Missing or invalid email rows are reported, never fabricated.</span>
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Held segment</span>
              <input name="segment" required defaultValue="apollo-import-2026-08" className="mt-1 w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Tags</span>
              <input name="tags" defaultValue="apollo, imported-2026-08" className="mt-1 w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-sm" />
            </label>
            <div className="flex flex-wrap items-center justify-between gap-3 md:col-span-2">
              <p className="max-w-2xl text-xs leading-5 text-on-surface-variant">Provider verification is retained as provenance, not treated as permission to send. Existing suppression and stronger eligibility decisions are preserved.</p>
              <button type="submit" className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary">Import to contact bank</button>
            </div>
          </form>
        </div>
      </details>

      <details id="new-campaign" open={Boolean(query.error)} className="group rounded-2xl border border-outline-variant/20 bg-surface-container-lowest shadow-float">
        <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3 p-5 md:p-6">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">Compose</p>
            <h2 className="mt-1 font-headline text-xl font-bold text-on-background">Create campaign</h2>
            <p className="mt-1 text-sm text-on-surface-variant">Start with a name and reviewed audience. Message rules stay tucked away until needed.</p>
          </div>
          <span className="rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary">Create campaign</span>
        </summary>

        <div className="border-t border-outline-variant/15 p-5 md:p-6">
          {composer.warnings.length > 0 ? (
            <ul className="space-y-1 rounded-xl bg-amber-500/10 px-4 py-3 text-sm text-on-surface-variant">
              {composer.warnings.map((warning) => <li key={warning}>- {warning}</li>)}
            </ul>
          ) : null}

        <div className="mt-5 grid gap-5 xl:grid-cols-2">
          {composer.campaigns.map((campaign) => {
            const segments = campaignSegments(campaign.vertical, composer.segments);
            const preset = campaign.vertical === 'msp_it_services' ? mspPreset : agencyPreset;
            return (
              <form key={campaign.id} action={createEmailCampaignAction} className="space-y-4 rounded-2xl border border-outline-variant/20 bg-surface-container-low p-4 md:p-5">
                <input type="hidden" name="campaignId" value={campaign.id} />
                <input type="hidden" name="buyer" value={campaign.buyer_role} />
                <input type="hidden" name="offerKey" value={campaign.offer_key} />
                <input type="hidden" name="ctaGoal" value={campaign.cta_goal} />
                <input type="hidden" name="bodyFormat" value={preset.bodyFormat} />
                <input type="hidden" name="hypothesis" value="A governed evidence-first message can earn a qualified reply without unsupported claims." />
                <input type="hidden" name="objective" value="Earn one qualified human reply from the active vertical." />
                <input type="hidden" name="closureCondition" value="Record the declared success or stop result with provider and funnel evidence." />
                <input type="hidden" name="sendWindowStartHour" value="9" />
                <input type="hidden" name="sendWindowEndHour" value="17" />
                <input type="hidden" name="spacingMinutes" value="60" />
                <input type="hidden" name="dailyCap" value="25" />
                <input type="hidden" name="utmContent" value={campaign.vertical === 'msp_it_services' ? 'msp-evidence-first' : 'agency-scorecard'} />

                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">{campaign.role}</p>
                    <h3 className="mt-1 font-headline text-lg font-bold text-on-background">{campaign.campaign_key}</h3>
                    <p className="mt-1 text-xs text-on-surface-variant">{campaign.vertical.replaceAll('_', ' ')} - {campaign.allocation_percent}% allocation</p>
                  </div>
                  <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">held until preflight</span>
                </div>

                <label className="block text-sm font-semibold text-on-background">
                  Draft name
                  <input name="name" required defaultValue={`${campaign.role === 'primary' ? 'MSP' : 'Agency'} evidence-first pilot`} className="mt-1 w-full rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-3 py-2 text-sm" />
                </label>
                <input type="hidden" name="interventionKey" value={draftKey(campaign.campaign_key)} />
                <label className="block text-sm font-semibold text-on-background">
                  Contact segment
                  <select name="segment" required disabled={segments.length === 0} className="mt-1 w-full rounded-xl border border-outline-variant/30 bg-surface-container-lowest px-3 py-2 text-sm disabled:opacity-60">
                    {segments.map((segment) => (
                      <option key={segment.segment} value={segment.segment}>
                        {segment.segment} - {segment.eligible} eligible / {segment.total} total
                      </option>
                    ))}
                    {segments.length === 0 ? <option value="">No matching segment</option> : null}
                  </select>
                </label>

                {segments.map((segment) => (
                  <div key={segment.segment} className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    {[
                      ['Eligible', segment.eligible],
                      ['Verify', segment.needsVerification],
                      ['Excluded', segment.excluded],
                      ['In sequence', segment.inSequence],
                    ].map(([label, value]) => (
                      <div key={label} className="rounded-lg bg-surface-container-lowest px-2.5 py-2">
                        <p className="font-bold text-on-background">{value}</p>
                        <p className="text-on-surface-variant">{label}</p>
                      </div>
                    ))}
                  </div>
                ))}

                <details className="rounded-xl border border-outline-variant/20 bg-surface-container-lowest">
                  <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-on-background">Message and safeguards</summary>
                  <div className="grid gap-4 border-t border-outline-variant/15 p-4">
                    <label className="block text-sm font-semibold text-on-background">One meaningful variable<input name="meaningfulVariable" required defaultValue="Evidence-first email through the governed campaign workflow." className="mt-1 w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-sm" /></label>
                    <label className="block text-sm font-semibold text-on-background">Success condition<input name="successCondition" required defaultValue={campaign.success_condition} className="mt-1 w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-sm" /></label>
                    <label className="block text-sm font-semibold text-on-background">Stop condition<input name="stopCondition" required defaultValue={campaign.stop_condition} className="mt-1 w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-sm" /></label>
                    <label className="block text-sm font-semibold text-on-background">Subject<input name="subject" required defaultValue={preset.subject} className="mt-1 w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-sm" /></label>
                    <input type="hidden" name="previewText" value="A dated public-site readiness audit with an evidence boundary." />
                    <label className="block text-sm font-semibold text-on-background">First message<textarea name="bodyTemplate" required defaultValue={preset.body} rows={10} className="mt-1 w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-2 font-mono text-xs leading-5" /></label>
                  </div>
                </details>
                <input type="hidden" name="owner" value="elena" />
                <button type="submit" disabled={segments.length === 0} className="w-full rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary disabled:opacity-50">
                  Create held draft
                </button>
              </form>
            );
          })}
        </div>
        </div>
      </details>

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
