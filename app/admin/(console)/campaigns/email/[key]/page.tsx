import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import { loadEmailCampaignDetail } from '@/lib/server/email-campaign-console';
import type { SectionState, SectionStatus } from '@/lib/server/email-campaign-contract';
import { freezeEmailCampaignAudienceAction, saveEmailCampaignDraftAction } from '../actions';

export const dynamic = 'force-dynamic';

const SECTION_STYLE: Record<SectionState, string> = {
  complete: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  needs_attention: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  unavailable: 'bg-surface-container text-on-surface-variant',
};

const SECTION_LABEL: Record<SectionState, string> = {
  complete: 'Complete',
  needs_attention: 'Needs attention',
  unavailable: 'Unavailable',
};

function StateChip({ state }: { readonly state: SectionState }) {
  return (
    <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${SECTION_STYLE[state]}`}>
      {SECTION_LABEL[state]}
    </span>
  );
}

function Section({
  status,
  children,
}: {
  readonly status: SectionStatus;
  readonly children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-outline-variant/20 bg-surface-container-lowest p-5 shadow-float md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 className="font-headline text-lg font-bold text-on-background">{status.label}</h2>
        <StateChip state={status.state} />
      </div>
      <p className="mt-1 text-sm leading-6 text-on-surface-variant">{status.detail}</p>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  name,
  defaultValue,
  hint,
  type = 'text',
  disabled,
}: {
  readonly label: string;
  readonly name: string;
  readonly defaultValue?: string | number | null;
  readonly hint?: string;
  readonly type?: string;
  readonly disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">{label}</span>
      <input
        type={type}
        name={name}
        defaultValue={defaultValue ?? ''}
        disabled={disabled}
        className="mt-1 w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-2 text-sm text-on-background disabled:opacity-60"
      />
      {hint ? <span className="mt-1 block text-xs text-on-surface-variant">{hint}</span> : null}
    </label>
  );
}

export default async function EmailCampaignDetailPage({
  params,
  searchParams,
}: {
  readonly params: Promise<{ key: string }>;
  readonly searchParams?: Promise<{ contact?: string; view?: string }>;
}) {
  const ctx = await loadAdminPageContext('/admin/campaigns/email');
  if (!ctx.ok) return <p className="text-error">{ctx.message}</p>;

  const { key } = await params;
  const query = (await searchParams) ?? {};
  const detail = await loadEmailCampaignDetail({
    supabase: ctx.adminDb,
    env: ctx.env as unknown as Record<string, string | undefined>,
    interventionKey: key,
    previewContactId: query.contact ?? null,
  });
  if (!detail) notFound();

  const { contract, sections, preview, sender } = detail;
  const section = (name: string) => sections.find((item) => item.key === name)!;
  const mobileView = query.view === 'mobile';

  return (
    <div className="space-y-6">
      <header className="rounded-3xl bg-on-background p-6 text-background shadow-float md:p-8">
        <Link href="/admin/campaigns/email" className="text-xs font-semibold text-background/70 hover:underline">
          ← All email campaigns
        </Link>
        <h1 className="mt-3 font-headline text-3xl font-black md:text-4xl">{detail.record.interventionName}</h1>
        <p className="mt-2 text-sm text-background/70">
          {detail.record.campaignName} · {detail.record.campaignRole} · version {contract.version}
          {detail.locked ? ' · locked (edits create a new version)' : ''}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {sections.map((status) => (
            <span
              key={status.key}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                status.state === 'complete'
                  ? 'bg-emerald-400/20 text-emerald-100'
                  : status.state === 'needs_attention'
                    ? 'bg-amber-400/20 text-amber-100'
                    : 'bg-background/10 text-background/60'
              }`}
            >
              {status.label}
            </span>
          ))}
        </div>
      </header>

      {detail.warnings.length > 0 ? (
        <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-5">
          <h2 className="font-headline text-base font-bold text-on-background">Before this can send</h2>
          <ul className="mt-2 space-y-1 text-sm leading-6 text-on-surface-variant">
            {detail.warnings.map((warning) => (
              <li key={warning}>· {warning}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <form action={saveEmailCampaignDraftAction} className="space-y-6">
        <input type="hidden" name="interventionKey" value={contract.interventionKey} />

        <Section status={section('goal')}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Objective" name="objective" defaultValue={contract.goal.objective} />
            <Field label="Buyer" name="buyer" defaultValue={contract.goal.buyer} />
            <Field label="Offer" name="offerKey" defaultValue={contract.goal.offerKey} />
            <Field label="What one reply should do" name="ctaGoal" defaultValue={contract.goal.ctaGoal} />
            <Field label="Owner" name="owner" defaultValue={contract.goal.owner} />
            <Field
              label="The one meaningful variable"
              name="meaningfulVariable"
              defaultValue={contract.goal.meaningfulVariable}
              hint="Change one thing per intervention, or the result is not attributable."
            />
            <Field label="Success condition" name="successCondition" defaultValue={contract.goal.successCondition} />
            <Field label="Stop condition" name="stopCondition" defaultValue={contract.goal.stopCondition} />
            <Field label="Closure condition" name="closureCondition" defaultValue={contract.goal.closureCondition} />
            <Field label="Retry policy" name="retryPolicy" defaultValue={contract.goal.retryPolicy} />
          </div>
        </Section>

        <Section status={section('sender')}>
          <dl className="grid gap-3 text-sm md:grid-cols-2">
            <div>
              <dt className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">From</dt>
              <dd className="mt-1 text-on-background">
                {sender.authenticated
                  ? `${contract.sender.displayName} <${sender.resolvedFromAddress ?? ''}>`
                  : 'No authenticated GEO-Pulse sender'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Reply-to</dt>
              <dd className="mt-1 text-on-background">
                {sender.authenticated ? contract.sender.replyToRef : 'Unavailable'}
              </dd>
            </div>
          </dl>
          {!sender.authenticated ? (
            <p className="mt-3 rounded-xl bg-surface-container-low px-4 py-3 text-xs leading-5 text-on-surface-variant">
              This is the one expected founder / credential-holder boundary. A sending identity must be authenticated
              (SPF, DKIM, DMARC) before any campaign can be tested or scheduled. Nothing on this page can create one.
            </p>
          ) : null}
        </Section>

        <Section status={section('subject')}>
          <div className="grid gap-4">
            <Field label="Subject" name="subject" defaultValue={contract.content.subject} />
            <Field
              label="Preview text"
              name="previewText"
              defaultValue={contract.content.previewText}
              hint="Shown beside the subject in most inboxes."
            />
          </div>
        </Section>

        <Section status={section('content')}>
          <label className="block">
            <span className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Body</span>
            <textarea
              name="bodyTemplate"
              defaultValue={contract.content.bodyTemplate}
              rows={14}
              className="mt-1 w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-3 py-2 font-mono text-xs text-on-background"
            />
          </label>
          <input type="hidden" name="bodyFormat" value={contract.content.bodyFormat} />
          <p className="mt-2 text-xs text-on-surface-variant">
            Merge fields in use: {contract.content.requiredMergeFields.length > 0
              ? contract.content.requiredMergeFields.map((field) => `{{${field}}}`).join(', ')
              : 'none'}
          </p>
          <dl className="mt-4 grid gap-3 text-xs md:grid-cols-4">
            {[
              ['utm_source', contract.tracking.utmSource],
              ['utm_medium', contract.tracking.utmMedium],
              ['utm_campaign', contract.tracking.utmCampaign],
              ['utm_content', contract.tracking.utmContent],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-surface-container-low px-3 py-2">
                <dt className="font-bold uppercase tracking-wider text-on-surface-variant">{label}</dt>
                <dd className="mt-1 text-on-background">{value}</dd>
              </div>
            ))}
          </dl>
        </Section>

        <Section status={section('schedule')}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="First send (Montréal time)"
              name="startAt"
              type="datetime-local"
              hint={contract.schedule.startAt ? `Currently ${contract.schedule.startAt}` : 'Not scheduled yet'}
            />
            <Field label="Spacing (minutes between sends)" name="spacingMinutes" type="number" defaultValue={contract.schedule.spacingMinutes} />
            <Field label="Daily cap" name="dailyCap" type="number" defaultValue={contract.schedule.dailyCap} />
            <Field label="Send window start hour" name="sendWindowStartHour" type="number" defaultValue={contract.schedule.sendWindowStartHour} />
            <Field label="Send window end hour" name="sendWindowEndHour" type="number" defaultValue={contract.schedule.sendWindowEndHour} />
          </div>
          <p className="mt-3 text-xs leading-5 text-on-surface-variant">
            Bounded sequence: {contract.schedule.maxSequenceSteps} messages at days{' '}
            {contract.schedule.sequenceDelaysDays.join(', ')}. Replies, unsubscribes, disqualification, conversion, and
            an exhausted retry policy stop every later step.
          </p>
        </Section>

        <div className="flex flex-wrap gap-3">
          <button type="submit" className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary">
            Save draft
          </button>
          <button
            type="button"
            disabled
            title="Internal test delivery arrives with the scheduling preflight (ECP-3)."
            className="rounded-xl border border-outline-variant/30 px-5 py-2.5 text-sm font-bold text-on-surface-variant opacity-60"
          >
            Preview &amp; test
          </button>
          <button
            type="button"
            disabled
            title={
              detail.readyToSchedule
                ? 'Scheduling arrives with the preflight gate (ECP-3).'
                : 'Every section above must be complete before scheduling.'
            }
            className="rounded-xl border border-outline-variant/30 px-5 py-2.5 text-sm font-bold text-on-surface-variant opacity-60"
          >
            Schedule
          </button>
        </div>
      </form>

      <Section status={section('audience')}>
        <p className="text-sm text-on-surface-variant">
          Source segment <span className="font-semibold text-on-background">{contract.audience.segment}</span>
        </p>
        {contract.audience.audienceId ? (
          <>
            <p className="mt-2 text-sm text-on-background">
              {contract.audience.recipientCount} recipients frozen {contract.audience.frozenAt} · checksum{' '}
              <code className="text-xs">{contract.audience.checksum?.slice(0, 12)}</code>
            </p>
            {Object.keys(contract.audience.excludedCounts).length > 0 ? (
              <ul className="mt-2 text-xs leading-5 text-on-surface-variant">
                {Object.entries(contract.audience.excludedCounts).map(([reason, count]) => (
                  <li key={reason}>· {count} excluded — {reason.replaceAll('_', ' ')}</li>
                ))}
              </ul>
            ) : null}
            {detail.audienceSample.length > 0 ? (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[520px] border-collapse text-sm">
                  <thead>
                    <tr className="text-left text-[10px] font-bold uppercase tracking-widest text-on-surface-variant">
                      <th className="py-2 pr-4">#</th>
                      <th className="px-4 py-2">Contact</th>
                      <th className="px-4 py-2">Company</th>
                      <th className="px-4 py-2">Email</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detail.audienceSample.map((row) => (
                      <tr key={row.email} className="border-t border-outline-variant/15">
                        <td className="py-2 pr-4 text-on-surface-variant">{row.position}</td>
                        <td className="px-4 py-2 text-on-background">{row.name ?? '—'}</td>
                        <td className="px-4 py-2 text-on-surface-variant">{row.company ?? '—'}</td>
                        <td className="px-4 py-2 text-on-surface-variant">{row.email}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        ) : (
          <form action={freezeEmailCampaignAudienceAction} className="mt-3 flex flex-wrap items-end gap-3">
            <input type="hidden" name="interventionKey" value={contract.interventionKey} />
            <Field label="Recipient cap" name="recipientCap" type="number" defaultValue={contract.schedule.dailyCap} />
            <button type="submit" className="rounded-xl bg-primary px-5 py-2.5 text-sm font-bold text-on-primary">
              Freeze audience
            </button>
            <p className="w-full text-xs leading-5 text-on-surface-variant">
              Freezing locks exactly who this version mails. A later import into the same segment cannot change it.
            </p>
          </form>
        )}
      </Section>

      <Section status={section('preview_test')}>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/campaigns/email/${contract.interventionKey}?view=desktop${query.contact ? `&contact=${query.contact}` : ''}`}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${!mobileView ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant'}`}
          >
            Desktop
          </Link>
          <Link
            href={`/admin/campaigns/email/${contract.interventionKey}?view=mobile${query.contact ? `&contact=${query.contact}` : ''}`}
            className={`rounded-xl px-4 py-2 text-sm font-semibold ${mobileView ? 'bg-primary text-on-primary' : 'bg-surface-container-low text-on-surface-variant'}`}
          >
            Mobile
          </Link>
          {detail.previewContacts.slice(0, 5).map((contact) => (
            <Link
              key={contact.contactId}
              href={`/admin/campaigns/email/${contract.interventionKey}?contact=${contact.contactId}${mobileView ? '&view=mobile' : ''}`}
              className="rounded-xl bg-surface-container-low px-3 py-2 text-xs font-semibold text-on-surface-variant"
            >
              as {contact.name ?? contact.email}
            </Link>
          ))}
        </div>

        {preview ? (
          <div className="mt-4 space-y-3">
            <dl className="grid gap-2 text-sm md:grid-cols-2">
              <div><dt className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">From</dt><dd className="text-on-background">{preview.senderLine}</dd></div>
              <div><dt className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Reply-to</dt><dd className="text-on-background">{preview.replyToLine}</dd></div>
              <div><dt className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Subject</dt><dd className="text-on-background">{preview.subject}</dd></div>
              <div><dt className="text-xs font-bold uppercase tracking-wider text-on-surface-variant">Preview line</dt><dd className="text-on-background">{preview.previewText}</dd></div>
            </dl>

            {preview.unresolved.length > 0 ? (
              <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4">
                <p className="text-sm font-bold text-red-700 dark:text-red-300">Personalization does not resolve for this contact</p>
                <ul className="mt-2 space-y-1 text-xs leading-5 text-on-surface-variant">
                  {preview.unresolved.map((item) => (
                    <li key={item.field}>· <code>{`{{${item.field}}}`}</code> — {item.why}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="rounded-xl bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">
                Every merge field resolves for this contact.
              </p>
            )}

            <div className={`overflow-hidden rounded-xl border border-outline-variant/20 bg-white ${mobileView ? 'mx-auto max-w-[390px]' : ''}`}>
              <iframe
                title="Campaign preview"
                sandbox=""
                srcDoc={preview.html}
                className={`w-full ${mobileView ? 'h-[720px]' : 'h-[820px]'}`}
              />
            </div>

            <details className="rounded-xl bg-surface-container-low px-4 py-3">
              <summary className="cursor-pointer text-sm font-semibold text-on-background">
                Links in this message ({preview.links.length})
              </summary>
              <ul className="mt-2 space-y-1 break-all text-xs text-on-surface-variant">
                {preview.links.map((link) => <li key={link}>· {link}</li>)}
              </ul>
            </details>
          </div>
        ) : (
          <p className="mt-3 rounded-xl bg-surface-container-low px-4 py-4 text-sm text-on-surface-variant">
            No eligible contact is available to preview against yet.
          </p>
        )}
      </Section>

      <Section status={section('results')}>
        <p className="text-sm text-on-surface-variant">
          Results reconcile against the send, reply, attribution, checkout, and subscription ledgers once this campaign
          starts sending. Opens and clicks are leading indicators only.
        </p>
      </Section>
    </div>
  );
}
