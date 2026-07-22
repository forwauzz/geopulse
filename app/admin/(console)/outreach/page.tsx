import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import { listOutreachProspects } from '@/lib/server/outreach';
import {
  PRESET_OUTREACH_TEMPLATES,
  SAMPLE_TEMPLATE_VARS,
  listOutreachTemplates,
  renderOutreachTemplate,
} from '@/lib/server/outreach-templates';
import {
  contactsTableExists,
  listContacts,
  listSegments,
} from '@/lib/server/outreach-contacts';
import {
  addOutreachProspect,
  addSegmentToSequenceAction,
  assignProspectTemplate,
  deleteOutreachContactAction,
  deleteOutreachProspect,
  deleteOutreachTemplate,
  importOutreachContactsAction,
  importOutreachProspects,
  rescheduleOutreachProspect,
  runOutreachNowAction,
  saveOutreachTemplate,
  toggleOutreachProspect,
} from './actions';

export const dynamic = 'force-dynamic';

const input =
  'min-h-[40px] w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 font-body text-sm text-on-surface outline-none focus:ring-2 focus:ring-tertiary/30';

function fmt(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Toronto' });
}

type SendRow = {
  prospect_id: string;
  score: number | null;
  sent_at: string;
  opened_at: string | null;
  open_count: number;
  scan_id: string | null;
};

export default async function AdminOutreachPage({
  searchParams,
}: {
  searchParams?: Promise<{
    imported?: string;
    invalid?: string;
    contactsImported?: string;
    contactsInvalid?: string;
    contactsError?: string;
    seqAdded?: string;
    seqSkipped?: string;
    segment?: string;
  }>;
}) {
  const importSummary = searchParams ? await searchParams : undefined;
  const ctx = await loadAdminPageContext('/admin/outreach');
  if (!ctx.ok) {
    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <p className="text-error">{ctx.message}</p>
      </main>
    );
  }

  const prospects = await listOutreachProspects(ctx.adminDb);
  const templates = await listOutreachTemplates(ctx.adminDb);

  // Contact bank (issue #136) — degrades to a dormant panel until migration 057.
  const contactsReady = await contactsTableExists(ctx.adminDb);
  const segments = contactsReady ? await listSegments(ctx.adminDb) : [];
  const bankContacts = contactsReady
    ? await listContacts(ctx.adminDb, importSummary?.segment || null)
    : [];

  // Funnel signals (issue #116): which delivered scans were VIEWED (served to a
  // browser) and which converted to a FULL deep-audit report.
  const scanIds = prospects.map((p) => p.lastScanId).filter((id): id is string => Boolean(id));
  let viewedScanIds = new Set<string>();
  let fullAuditScanIds = new Set<string>();
  if (scanIds.length > 0) {
    const [viewsRes, reportsRes] = await Promise.all([
      ctx.adminDb
        .from('app_logs')
        .select('data')
        .eq('event', 'outreach_report_viewed')
        .in('data->>scanId', scanIds)
        // Every serve logs a row, so heavily-viewed scans can crowd a small cap
        // and hide other prospects' badges. 2000 covers years at current volume.
        .limit(2000),
      ctx.adminDb.from('reports').select('scan_id').eq('type', 'deep_audit').in('scan_id', scanIds),
    ]);
    viewedScanIds = new Set(
      ((viewsRes.data ?? []) as { data: { scanId?: string } }[])
        .map((r) => r.data?.scanId)
        .filter((id): id is string => Boolean(id))
    );
    fullAuditScanIds = new Set(
      ((reportsRes.data ?? []) as { scan_id: string }[]).map((r) => r.scan_id)
    );
  }
  const { data: sendsData } = await ctx.adminDb
    .from('outreach_sends')
    .select('prospect_id, score, sent_at, opened_at, open_count, scan_id')
    .order('sent_at', { ascending: false })
    .limit(400);
  const sendsByProspect = new Map<string, SendRow[]>();
  for (const send of (sendsData ?? []) as SendRow[]) {
    const list = sendsByProspect.get(send.prospect_id) ?? [];
    list.push(send);
    sendsByProspect.set(send.prospect_id, list);
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">Admin</p>
        <h1 className="mt-1 font-sans text-2xl font-black uppercase tracking-tight text-on-background">Outreach</h1>
        <p className="mt-1 max-w-2xl font-sans text-sm text-on-surface-variant">
          Add a prospect and we audit their site on a cadence and email them the scorecard — no account on
          their side. The full report link is public; the report page carries the sign-up CTA.
        </p>
      </header>

      <section className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 md:p-6">
        <h2 className="font-sans text-lg font-bold text-on-background">Add prospect</h2>
        <form action={addOutreachProspect} className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">Email</span>
            <input name="email" type="email" required placeholder="owner@company.com" className={input} />
          </label>
          <label className="block">
            <span className="mb-1 block font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">Website</span>
            <input name="url" type="url" required placeholder="https://company.com" className={input} />
          </label>
          <label className="block">
            <span className="mb-1 block font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">Name (optional)</span>
            <input name="name" placeholder="Ernesto" className={input} />
          </label>
          <label className="block">
            <span className="mb-1 block font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">Company (optional)</span>
            <input name="company" placeholder="MIPS Media" className={input} />
          </label>
          <label className="block">
            <span className="mb-1 block font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">Cadence</span>
            <select name="cadence" defaultValue="monthly" className={input}>
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="daily">Daily</option>
              <option value="hourly">Hourly</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">Message template</span>
            <select name="templateId" defaultValue="" className={input}>
              <option value="">Default template / built-in scorecard</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.isDefault ? ' (default)' : ''}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">
              First send (Montréal time — blank = next hourly run)
            </span>
            <input name="startAt" type="datetime-local" className={input} />
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-on-primary transition hover:opacity-90"
            >
              Add & run on next tick
            </button>
          </div>
        </form>
      </section>

      {/* Bulk import (issue #94): the simplest possible UI — one box, one button. */}
      <section className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 md:p-6">
        <h2 className="font-sans text-lg font-bold text-on-background">Import a prospect list</h2>
        <p className="mt-1 font-sans text-sm text-on-surface-variant">
          Paste (or upload a .csv of) the companies you have already been in contact with — one per
          line: <code className="rounded bg-surface-container-low px-1">email, website, name, company, cadence</code>.
          Only email and website are required; cadence defaults to monthly. Existing prospects are
          updated, not duplicated. Audits start on the next hourly tick, 10 per hour.
        </p>
        {importSummary?.imported !== undefined && (
          <p className="mt-3 rounded-xl bg-green-100 px-4 py-2 font-sans text-sm font-semibold text-green-800 dark:bg-green-500/15 dark:text-green-200">
            Imported {importSummary.imported} prospect{importSummary.imported === '1' ? '' : 's'}
            {Number(importSummary.invalid ?? 0) > 0 ? ` · ${importSummary.invalid} line(s) skipped (invalid or duplicate)` : ''}.
          </p>
        )}
        <form action={importOutreachProspects} className="mt-4 grid gap-3">
          <textarea
            name="text"
            rows={5}
            placeholder={'jane@acme-it.ca, acme-it.ca, Jane, Acme IT, monthly\nmark@nordit.ca, nordit.ca'}
            className={`${input} min-h-[120px] py-2 font-mono text-xs`}
          />
          <div className="flex flex-wrap items-end gap-3">
            <input type="file" name="file" accept=".csv,.txt" className="font-sans text-xs text-on-surface-variant" />
            <label className="block">
              <span className="mb-1 block font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">
                First send for this batch (Montréal time, optional)
              </span>
              <input name="startAt" type="datetime-local" className={input} />
            </label>
            <button
              type="submit"
              className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-on-primary transition hover:opacity-90"
            >
              Import &amp; schedule audits
            </button>
          </div>
        </form>
      </section>

      {/* Contact bank (issue #136): Brevo-style saved segments — save now, sequence later. */}
      <section className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 md:p-6">
        <h2 className="font-sans text-lg font-bold text-on-background">Contact bank</h2>
        <p className="mt-1 font-sans text-sm text-on-surface-variant">
          Saved contacts receive <strong>nothing</strong> until you add their segment to the
          sequence. One line per contact:{' '}
          <code className="rounded bg-surface-container-low px-1">email, website, name, company, city</code>.
        </p>
        {!contactsReady ? (
          <p className="mt-3 rounded-xl bg-amber-100 px-4 py-2 font-sans text-sm font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
            Dormant until migration 057_outreach_contacts.sql is applied.
          </p>
        ) : (
          <>
            {importSummary?.contactsImported !== undefined && (
              <p className="mt-3 rounded-xl bg-green-100 px-4 py-2 font-sans text-sm font-semibold text-green-800 dark:bg-green-500/15 dark:text-green-200">
                Saved {importSummary.contactsImported} contact{importSummary.contactsImported === '1' ? '' : 's'}
                {Number(importSummary.contactsInvalid ?? 0) > 0 ? ` · ${importSummary.contactsInvalid} line(s) skipped` : ''}
                {importSummary.contactsError ? ` · error: ${importSummary.contactsError}` : ''}.
              </p>
            )}
            {importSummary?.seqAdded !== undefined && (
              <p className="mt-3 rounded-xl bg-sky-100 px-4 py-2 font-sans text-sm font-semibold text-sky-800 dark:bg-sky-500/15 dark:text-sky-200">
                Added {importSummary.seqAdded} contact{importSummary.seqAdded === '1' ? '' : 's'} to the sequence
                {Number(importSummary.seqSkipped ?? 0) > 0 ? ` · ${importSummary.seqSkipped} skipped (already prospects or unsubscribed)` : ''}.
              </p>
            )}

            {/* Segments: counts + one-click add-to-sequence. */}
            {segments.length > 0 && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {segments.map((seg) => (
                  <div key={seg.segment} className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-4">
                    <div className="flex items-center justify-between gap-2">
                      <a
                        href={`/admin/outreach?segment=${encodeURIComponent(seg.segment)}`}
                        className="font-sans text-sm font-bold text-on-background underline-offset-2 hover:underline"
                      >
                        {seg.segment}
                      </a>
                      <span className="rounded-md bg-surface-container px-2 py-0.5 font-sans text-xs font-semibold text-on-surface-variant">
                        {seg.saved} saved · {seg.total} total
                      </span>
                    </div>
                    {seg.saved > 0 && (
                      <form action={addSegmentToSequenceAction} className="mt-3 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="segment" value={seg.segment} />
                        <label className="block">
                          <span className="mb-1 block font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">
                            First send (Montréal time)
                          </span>
                          <input name="startAt" type="datetime-local" className={input} />
                        </label>
                        <select name="cadence" defaultValue="monthly" className={input}>
                          <option value="monthly">monthly</option>
                          <option value="weekly">weekly</option>
                        </select>
                        <button className="inline-flex min-h-[40px] items-center rounded-xl bg-primary px-4 text-sm font-semibold text-on-primary hover:opacity-90">
                          Add {seg.saved} to sequence
                        </button>
                      </form>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Save contacts into a segment. */}
            <form action={importOutreachContactsAction} className="mt-4 grid gap-3">
              <textarea
                name="contacts"
                rows={4}
                placeholder={'ceo@agence.ca, agence.ca, Jane Roy, Agence Créative, Montréal'}
                className={`${input} min-h-[100px] py-2 font-mono text-xs`}
              />
              <div className="flex flex-wrap items-end gap-3">
                <label className="block">
                  <span className="mb-1 block font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">
                    Segment (required)
                  </span>
                  <input name="segment" placeholder="marketing-agencies-qc" className={input} required />
                </label>
                <label className="block">
                  <span className="mb-1 block font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">
                    Tags (comma-separated, optional)
                  </span>
                  <input name="tags" placeholder="quebec, agency, seo" className={input} />
                </label>
                <button className="inline-flex min-h-[40px] items-center rounded-xl border border-outline-variant/30 px-5 font-sans text-sm font-semibold text-on-surface hover:bg-surface-container">
                  Save contacts
                </button>
              </div>
            </form>

            {/* Contact list (filtered by ?segment=). */}
            {bankContacts.length > 0 && (
              <div className="mt-5 overflow-x-auto">
                <p className="mb-2 font-sans text-xs text-on-surface-variant">
                  {importSummary?.segment ? (
                    <>
                      Showing <strong>{importSummary.segment}</strong> ·{' '}
                      <a className="underline" href="/admin/outreach">show all</a>
                    </>
                  ) : (
                    'All saved contacts (latest first)'
                  )}
                </p>
                <table className="w-full min-w-[760px] text-left font-sans text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wider text-on-surface-variant">
                      <th className="pb-2 pr-3 font-semibold">Contact</th>
                      <th className="pb-2 pr-3 font-semibold">Company</th>
                      <th className="pb-2 pr-3 font-semibold">Segment</th>
                      <th className="pb-2 pr-3 font-semibold">City</th>
                      <th className="pb-2 pr-3 font-semibold">Status</th>
                      <th className="pb-2 font-semibold" />
                    </tr>
                  </thead>
                  <tbody>
                    {bankContacts.slice(0, 60).map((c) => (
                      <tr key={c.id} className="border-t border-outline-variant/10">
                        <td className="py-2 pr-3">
                          <span className="font-semibold text-on-background">{c.email}</span>
                          <div className="text-xs text-on-surface-variant">{c.url}</div>
                        </td>
                        <td className="py-2 pr-3 text-on-surface-variant">{c.company ?? '—'}</td>
                        <td className="py-2 pr-3">
                          <span className="rounded-md bg-tertiary/10 px-1.5 py-0.5 text-xs font-semibold text-tertiary">{c.segment}</span>
                          {c.tags.length > 0 && (
                            <span className="ml-1 text-xs text-on-surface-variant">{c.tags.join(' · ')}</span>
                          )}
                        </td>
                        <td className="py-2 pr-3 text-on-surface-variant">{c.city ?? '—'}</td>
                        <td className="py-2 pr-3 text-xs">
                          {c.added_to_sequence_at ? (
                            <span className="font-semibold text-sky-700 dark:text-sky-300">In sequence</span>
                          ) : (
                            <span className="text-on-surface-variant">Saved</span>
                          )}
                        </td>
                        <td className="py-2 text-right">
                          <form action={deleteOutreachContactAction}>
                            <input type="hidden" name="contactId" value={c.id} />
                            <button className="rounded-lg border border-error/30 px-2.5 py-1 text-xs font-semibold text-error hover:bg-error/10">
                              Remove
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {bankContacts.length > 60 && (
                  <p className="mt-2 font-sans text-xs text-on-surface-variant">
                    Showing 60 of {bankContacts.length} — filter by segment to narrow.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {/* Message template designer (spec §9): free text or HTML, branded, with variables. */}
      <section className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 md:p-6">
        <h2 className="font-sans text-lg font-bold text-on-background">Message templates</h2>
        <p className="mt-1 font-sans text-sm text-on-surface-variant">
          Design what prospects receive. Variables:{' '}
          <code className="rounded bg-surface-container-low px-1">{'{{name}}'}</code>{' '}
          <code className="rounded bg-surface-container-low px-1">{'{{company}}'}</code>{' '}
          <code className="rounded bg-surface-container-low px-1">{'{{domain}}'}</code>{' '}
          <code className="rounded bg-surface-container-low px-1">{'{{score}}'}</code>{' '}
          <code className="rounded bg-surface-container-low px-1">{'{{grade}}'}</code>{' '}
          <code className="rounded bg-surface-container-low px-1">{'{{top_issues}}'}</code>{' '}
          <code className="rounded bg-surface-container-low px-1">{'{{report_url}}'}</code>. GEO-Pulse
          branding (header, footer, open tracking) is applied automatically.
        </p>

        {/* Preset library (issue #106): one click installs a professional starting point. */}
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {PRESET_OUTREACH_TEMPLATES.map((preset) => {
            const installed = templates.some((t) => t.name === preset.name);
            return (
              <div key={preset.key} className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-4">
                <p className="font-sans text-sm font-bold text-on-background">{preset.name}</p>
                <p className="mt-1 font-sans text-xs leading-5 text-on-surface-variant">{preset.description}</p>
                <p className="mt-1.5 font-mono text-[11px] text-on-surface-variant/80">{preset.subject}</p>
                <form action={saveOutreachTemplate} className="mt-3">
                  <input type="hidden" name="name" value={preset.name} />
                  <input type="hidden" name="subject" value={preset.subject} />
                  <input type="hidden" name="bodyFormat" value={preset.bodyFormat} />
                  <input type="hidden" name="body" value={preset.body} />
                  <button
                    type="submit"
                    disabled={installed}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                      installed
                        ? 'cursor-default bg-surface-container text-on-surface-variant'
                        : 'bg-primary text-on-primary hover:opacity-90'
                    }`}
                  >
                    {installed ? 'Installed' : 'Use this preset'}
                  </button>
                </form>
              </div>
            );
          })}
        </div>

        <form action={saveOutreachTemplate} className="mt-4 grid gap-3">
          <div className="grid gap-3 md:grid-cols-3">
            <label className="block">
              <span className="mb-1 block font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">Template name</span>
              <input name="name" required placeholder="Monthly scorecard nudge" className={input} />
            </label>
            <label className="block md:col-span-2">
              <span className="mb-1 block font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">Subject</span>
              <input
                name="subject"
                required
                placeholder="{{domain}}: your AI search readiness is {{score}}/100"
                className={input}
              />
            </label>
          </div>
          <label className="block">
            <span className="mb-1 block font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">Body</span>
            <textarea
              name="body"
              required
              rows={7}
              placeholder={
                'Hi {{name}},\n\nWe re-audited {{domain}} — it now scores {{score}}/100 ({{grade}}).\n\n{{top_issues}}\n\nFull report: {{report_url}}'
              }
              className={`${input} min-h-[160px] py-2 font-mono text-xs`}
            />
          </label>
          <div className="flex flex-wrap items-end gap-4">
            <label className="block">
              <span className="mb-1 block font-label text-[0.6rem] uppercase tracking-[0.13em] text-on-surface-variant">Format</span>
              <select name="bodyFormat" defaultValue="text" className={input}>
                <option value="text">Free text (we format it)</option>
                <option value="html">Raw HTML (advanced)</option>
              </select>
            </label>
            <label className="flex min-h-[40px] items-center gap-2 font-sans text-sm text-on-background">
              <input type="checkbox" name="makeDefault" value="true" className="h-4 w-4" />
              Make this the default for all prospects
            </label>
            <button
              type="submit"
              className="inline-flex min-h-[40px] items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-on-primary transition hover:opacity-90"
            >
              Save template
            </button>
          </div>
        </form>

        {templates.length > 0 && (
          <div className="mt-5 space-y-4">
            {templates.map((t) => {
              const preview = renderOutreachTemplate(t, SAMPLE_TEMPLATE_VARS, 'about:blank', 'about:blank#unsubscribe-preview');
              return (
                <div key={t.id} className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-sans text-sm font-bold text-on-background">
                      {t.name}
                      {t.isDefault ? (
                        <span className="ml-2 rounded-md bg-green-100 px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-widest text-green-800 dark:bg-green-500/15 dark:text-green-200">
                          Default
                        </span>
                      ) : null}
                      <span className="ml-2 text-xs font-normal uppercase text-on-surface-variant">{t.bodyFormat}</span>
                    </p>
                    <div className="flex items-center gap-2">
                      {!t.isDefault && (
                        <form action={saveOutreachTemplate}>
                          <input type="hidden" name="templateId" value={t.id} />
                          <input type="hidden" name="name" value={t.name} />
                          <input type="hidden" name="subject" value={t.subjectTemplate} />
                          <input type="hidden" name="bodyFormat" value={t.bodyFormat} />
                          <input type="hidden" name="body" value={t.bodyTemplate} />
                          <input type="hidden" name="makeDefault" value="true" />
                          <button
                            type="submit"
                            className="rounded-lg border border-outline-variant/30 px-2.5 py-1 text-xs font-semibold text-on-background transition hover:bg-surface-container-lowest"
                          >
                            Set default
                          </button>
                        </form>
                      )}
                      <form action={deleteOutreachTemplate}>
                        <input type="hidden" name="templateId" value={t.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-error/40 px-2.5 py-1 text-xs font-semibold text-error transition hover:bg-error/10"
                        >
                          Delete
                        </button>
                      </form>
                    </div>
                  </div>
                  <p className="mt-1 font-sans text-xs text-on-surface-variant">
                    Subject preview: <span className="text-on-background">{preview.subject}</span>
                  </p>
                  <details className="mt-2">
                    <summary className="cursor-pointer font-sans text-xs font-semibold text-primary">
                      Preview with sample data
                    </summary>
                    <iframe
                      title={`Preview: ${t.name}`}
                      sandbox=""
                      srcDoc={preview.html}
                      className="mt-2 h-72 w-full rounded-lg border border-outline-variant/20 bg-white"
                    />
                  </details>
                </div>
              );
            })}
          </div>
        )}
        {templates.length === 0 && (
          <p className="mt-4 font-sans text-xs text-on-surface-variant">
            No templates yet — sends use the built-in scorecard email. (If saving fails, migration
            054_outreach_templates.sql has not been applied to this database yet.)
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 md:p-6">
        <h2 className="font-sans text-lg font-bold text-on-background">Prospects</h2>
        {prospects.length === 0 ? (
          <p className="mt-3 font-sans text-sm text-on-surface-variant">None yet — add the first one above.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead>
                <tr className="border-b border-outline-variant/20 text-[11px] uppercase tracking-widest text-on-surface-variant">
                  <th className="py-2 pr-3 font-semibold">Prospect</th>
                  <th className="py-2 pr-3 font-semibold">Cadence</th>
                  <th className="py-2 pr-3 font-semibold">Last send</th>
                  <th className="py-2 pr-3 font-semibold">Opened</th>
                  <th className="py-2 pr-3 font-semibold">Next run</th>
                  <th className="py-2 pr-3 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/15">
                {prospects.map((prospect) => {
                  const sends = sendsByProspect.get(prospect.id) ?? [];
                  const latest = sends[0] ?? null;
                  const openedCount = sends.filter((s) => s.opened_at).length;
                  return (
                    <tr key={prospect.id} className={prospect.enabled ? '' : 'opacity-50'}>
                      <td className="py-2.5 pr-3">
                        <p className="font-medium text-on-background">{prospect.email}</p>
                        <p className="text-xs text-on-surface-variant">
                          {[prospect.name, prospect.company].filter(Boolean).join(' · ') || '—'} · {prospect.url}
                        </p>
                        {prospect.lastError ? (
                          <p className="text-xs text-error">Last error: {prospect.lastError}</p>
                        ) : null}
                      </td>
                      <td className="py-2.5 pr-3 capitalize text-on-background">{prospect.cadence}</td>
                      <td className="py-2.5 pr-3 text-on-background">
                        {latest ? (
                          <>
                            <span className="font-sans font-bold tabular-nums">{latest.score ?? '—'}</span>
                            <span className="text-xs text-on-surface-variant"> · {fmt(latest.sent_at)}</span>
                            {latest.scan_id ? (
                              <a
                                href={`/results/${latest.scan_id}`}
                                className="ml-2 text-xs font-semibold text-primary underline"
                                target="_blank"
                              >
                                report
                              </a>
                            ) : null}
                            {/* Funnel badges (issue #116): served-to-a-browser beats the pixel. */}
                            {prospect.lastScanId && viewedScanIds.has(prospect.lastScanId) && (
                              <span className="ml-2 inline-flex items-center gap-0.5 rounded-md bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-800 dark:bg-sky-500/15 dark:text-sky-200">
                                <span className="material-symbols-outlined text-[12px]" aria-hidden>visibility</span>
                                Viewed
                              </span>
                            )}
                            {prospect.lastScanId && fullAuditScanIds.has(prospect.lastScanId) && (
                              <span className="ml-1 inline-flex items-center gap-0.5 rounded-md bg-green-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-green-800 dark:bg-green-500/15 dark:text-green-200">
                                <span className="material-symbols-outlined text-[12px]" aria-hidden>task_alt</span>
                                Full audit
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-xs text-on-surface-variant">not sent yet</span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3">
                        {sends.length === 0 ? (
                          <span className="text-xs text-on-surface-variant">—</span>
                        ) : openedCount > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800 dark:bg-green-500/15 dark:text-green-200">
                            <span className="material-symbols-outlined text-[13px]" aria-hidden>drafts</span>
                            {openedCount}/{sends.length} opened
                          </span>
                        ) : (
                          <span
                            className="text-xs text-on-surface-variant"
                            title="Pixel-based opens undercount when images are blocked — treat as a floor."
                          >
                            no opens recorded
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-on-surface-variant">
                        {prospect.enabled ? fmt(prospect.nextRunAt) : 'paused'}
                      </td>
                      <td className="py-2.5 pr-3">
                        <div className="flex items-center gap-2">
                          <form action={runOutreachNowAction}>
                            <input type="hidden" name="prospectId" value={prospect.id} />
                            <button
                              type="submit"
                              className="rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-on-primary transition hover:opacity-90"
                            >
                              Run now
                            </button>
                          </form>
                          <form action={toggleOutreachProspect}>
                            <input type="hidden" name="prospectId" value={prospect.id} />
                            <input type="hidden" name="enable" value={prospect.enabled ? 'false' : 'true'} />
                            <button
                              type="submit"
                              className="rounded-lg border border-outline-variant/30 px-2.5 py-1 text-xs font-semibold text-on-background transition hover:bg-surface-container-low"
                            >
                              {prospect.enabled ? 'Pause' : 'Resume'}
                            </button>
                          </form>
                          <form action={rescheduleOutreachProspect} className="flex items-center gap-1">
                            <input type="hidden" name="prospectId" value={prospect.id} />
                            <input
                              name="startAt"
                              type="datetime-local"
                              className="min-h-[28px] rounded-lg border border-outline-variant/20 bg-surface-container-low px-1.5 text-xs text-on-surface"
                            />
                            <button
                              type="submit"
                              className="rounded-lg border border-outline-variant/30 px-2 py-1 text-xs font-semibold text-on-background transition hover:bg-surface-container-low"
                              title="Reschedule the next send (Montréal time)"
                            >
                              Schedule
                            </button>
                          </form>
                          <form action={deleteOutreachProspect}>
                            <input type="hidden" name="prospectId" value={prospect.id} />
                            <button
                              type="submit"
                              className="rounded-lg border border-error/40 px-2.5 py-1 text-xs font-semibold text-error transition hover:bg-error/10"
                              title="Delete this prospect and its send history"
                            >
                              Delete
                            </button>
                          </form>
                          {templates.length > 0 && (
                            <form action={assignProspectTemplate} className="flex items-center gap-1">
                              <input type="hidden" name="prospectId" value={prospect.id} />
                              <select
                                name="templateId"
                                defaultValue={prospect.templateId ?? ''}
                                className="min-h-[28px] rounded-lg border border-outline-variant/20 bg-surface-container-low px-1.5 text-xs text-on-surface"
                              >
                                <option value="">Default</option>
                                {templates.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                  </option>
                                ))}
                              </select>
                              <button
                                type="submit"
                                className="rounded-lg border border-outline-variant/30 px-2 py-1 text-xs font-semibold text-on-background transition hover:bg-surface-container-low"
                              >
                                Set
                              </button>
                            </form>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-[11px] text-on-surface-variant">
          Opens are measured with a first-party pixel and undercount when images are blocked — treat them as
          a floor, not the truth.
        </p>
      </section>
    </div>
  );
}
