/**
 * Outreach message templates (spec §9) — admin-authored subject/body with variables,
 * rendered into the branded email shell.
 *
 * Variables: {{name}} {{company}} {{domain}} {{score}} {{grade}} {{top_issues}} {{report_url}}
 *   - All variable VALUES are HTML-escaped except {{top_issues}} and {{report_url}}
 *     (we generate that markup ourselves).
 *   - 'text' bodies are escaped and paragraph-wrapped, then branded — an admin can
 *     write plain sentences and still send a decent-looking email.
 *   - 'html' bodies are trusted admin input, injected into the brand shell as-is.
 *
 * Fail-soft everywhere: if the templates table is missing (migration 054 not applied
 * yet) or empty, callers fall back to the built-in scorecard email.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { emailShell } from './email-theme';

export type OutreachTemplateFormat = 'text' | 'html';

export interface OutreachTemplate {
  id: string;
  name: string;
  subjectTemplate: string;
  bodyFormat: OutreachTemplateFormat;
  bodyTemplate: string;
  isDefault: boolean;
}

export interface OutreachTemplateVars {
  name: string | null;
  company: string | null;
  domain: string;
  score: number;
  grade: string;
  topIssues: ReadonlyArray<{ check?: string; fix?: string }>;
  reportUrl: string;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function topIssuesHtml(topIssues: OutreachTemplateVars['topIssues']): string {
  const items = topIssues
    .slice(0, 3)
    .map(
      (issue) =>
        `<li style="margin-bottom:8px;"><strong>${escapeHtml(issue.check ?? 'Check')}</strong>${
          issue.fix ? `<br/><span style="color:#555;">${escapeHtml(issue.fix)}</span>` : ''
        }</li>`
    )
    .join('');
  return items ? `<ul style="padding-left:18px;">${items}</ul>` : '';
}

function substitute(template: string, vars: OutreachTemplateVars, opts: { escape: boolean }): string {
  const esc = (v: string) => (opts.escape ? escapeHtml(v) : v);
  return template
    .replaceAll('{{name}}', esc(vars.name ?? 'there'))
    .replaceAll('{{company}}', esc(vars.company ?? vars.domain))
    .replaceAll('{{domain}}', esc(vars.domain))
    .replaceAll('{{score}}', esc(String(vars.score)))
    .replaceAll('{{grade}}', esc(vars.grade))
    .replaceAll('{{report_url}}', vars.reportUrl)
    .replaceAll('{{top_issues}}', topIssuesHtml(vars.topIssues));
}

/**
 * GEO-Pulse brand shell — delegates to the ONE email design system (issue #106).
 * CASL: the footer is part of the shell so no template — however custom — can ship
 * a commercial email without identification and a working unsubscribe (issue #97).
 */
export function brandShell(innerHtml: string, pixelUrl: string, unsubscribeUrl?: string): string {
  return emailShell({
    kicker: 'AI search readiness',
    bodyHtml: innerHtml,
    unsubscribeUrl,
    pixelUrl,
  });
}

/** Render a template into { subject, html } ready for sending. */
export function renderOutreachTemplate(
  template: Pick<OutreachTemplate, 'subjectTemplate' | 'bodyFormat' | 'bodyTemplate'>,
  vars: OutreachTemplateVars,
  pixelUrl: string,
  unsubscribeUrl?: string
): { subject: string; html: string } {
  const subject = substitute(template.subjectTemplate, vars, { escape: false });

  let body: string;
  if (template.bodyFormat === 'html') {
    body = substitute(template.bodyTemplate, vars, { escape: true });
  } else {
    // Plain text: substitute with escaped values on the escaped body, then paragraphize.
    const escaped = escapeHtml(template.bodyTemplate);
    // Escaping turned {{...}} braces into themselves (braces are not escaped), so
    // substitution still works; values get escaped, the issues block stays HTML.
    const substituted = substitute(escaped, vars, { escape: true });
    body = substituted
      .split(/\n{2,}/)
      .map((p) => `<p>${p.replaceAll('\n', '<br/>')}</p>`)
      .join('\n');
  }

  return { subject, html: brandShell(body, pixelUrl, unsubscribeUrl) };
}

type TemplateRow = {
  id: string;
  name: string;
  subject_template: string;
  body_format: string;
  body_template: string;
  is_default: boolean;
};

function toTemplate(row: TemplateRow): OutreachTemplate {
  return {
    id: row.id,
    name: row.name,
    subjectTemplate: row.subject_template,
    bodyFormat: row.body_format === 'html' ? 'html' : 'text',
    bodyTemplate: row.body_template,
    isDefault: Boolean(row.is_default),
  };
}

/** List all templates. Fail-soft: [] when the table does not exist yet. */
export async function listOutreachTemplates(supabase: SupabaseClient): Promise<OutreachTemplate[]> {
  try {
    const { data, error } = await supabase
      .from('outreach_templates')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) return [];
    return ((data ?? []) as TemplateRow[]).map(toTemplate);
  } catch {
    return [];
  }
}

/**
 * Resolve the template for a send: the prospect's pinned template, else the default,
 * else null (caller falls back to the built-in scorecard email).
 */
export async function resolveOutreachTemplate(
  supabase: SupabaseClient,
  templateId: string | null
): Promise<OutreachTemplate | null> {
  try {
    if (templateId) {
      const { data } = await supabase
        .from('outreach_templates')
        .select('*')
        .eq('id', templateId)
        .maybeSingle();
      if (data) return toTemplate(data as TemplateRow);
    }
    const { data: def } = await supabase
      .from('outreach_templates')
      .select('*')
      .eq('is_default', true)
      .maybeSingle();
    return def ? toTemplate(def as TemplateRow) : null;
  } catch {
    return null;
  }
}

/**
 * Preset template library (issue #106) — professional, lively starting points the
 * admin installs with one click. All variables resolve at send time; the brand shell
 * (masthead, Montréal footer, unsubscribe) wraps every one automatically.
 */
export const PRESET_OUTREACH_TEMPLATES: ReadonlyArray<{
  key: string;
  name: string;
  description: string;
  subject: string;
  bodyFormat: OutreachTemplateFormat;
  body: string;
}> = [
  {
    key: 'first-scorecard',
    name: 'First scorecard — the gift opener',
    description: 'Warm first touch: we did real work for you before asking for anything.',
    subject: 'We audited {{domain}} — your AI search readiness is {{score}}/100',
    bodyFormat: 'text',
    body: `Hi {{name}},

Quick heads-up from a fellow Montréal company: we ran {{company}} through our AI search readiness audit — the same checks ChatGPT, Gemini and Perplexity effectively apply when they decide whether to cite a business like yours.

{{domain}} scored {{score}}/100 (grade {{grade}}). Here is what is holding it back the most:

{{top_issues}}

The full report explains every check in plain English, with copy-paste fixes your web person can apply — no account, no strings: {{report_url}}

We re-run this on a schedule so you can watch the score move as things get fixed.`,
  },
  {
    key: 'monthly-pulse',
    name: 'Monthly pulse — the returning cadence',
    description: 'For prospects already receiving audits: this month’s standings, brief and confident.',
    subject: '{{domain}} this month: {{score}}/100 on AI search readiness',
    bodyFormat: 'text',
    body: `Hi {{name}},

Your monthly AI-visibility pulse for {{domain}} is in: {{score}}/100 ({{grade}}).

Where the easiest points are sitting right now:

{{top_issues}}

Full breakdown, matrix of which AI engines can see you, and the fixes: {{report_url}}

Same time next month — unless the score jumps first.`,
  },
  {
    key: 'quick-wins',
    name: 'Quick wins — the nudge',
    description: 'Short and surgical: three fixes, one link, no fluff.',
    subject: '3 fixes that would move {{domain}} up in AI search',
    bodyFormat: 'text',
    body: `Hi {{name}},

Three things on {{domain}} are costing you visibility in AI search results right now:

{{top_issues}}

Each one has a copy-paste fix in your report ({{score}}/100 today): {{report_url}}

Most of these are under 30 minutes for whoever manages your site.`,
  },
  {
    key: 'plain-personal',
    name: 'Plain & personal — the founder note',
    description: 'Reads like a one-to-one email; the brand shell keeps it credible.',
    subject: 'Noticed something about {{domain}}',
    bodyFormat: 'text',
    body: `Hi {{name}},

I run GEO-Pulse here in Montréal — we measure how visible businesses are when people ask AI assistants for recommendations instead of Googling.

I ran {{domain}} through it. You came out at {{score}}/100. Some of what is in the way is genuinely quick to fix.

The full report is here, free, no sign-up: {{report_url}}

Happy to point your web person at the two changes that matter most — just reply.`,
  },
];

/** Sample variables for the admin preview. */
export const SAMPLE_TEMPLATE_VARS: OutreachTemplateVars = {
  name: 'Alex',
  company: 'Acme IT Services',
  domain: 'acme-it.example',
  score: 61,
  grade: 'D',
  topIssues: [
    { check: 'AI retrieval agent access', fix: 'Allow OAI-SearchBot, Claude-SearchBot and PerplexityBot in robots.txt.' },
    { check: 'Structured data validity', fix: 'Add LocalBusiness schema with your name and address.' },
  ],
  reportUrl: 'https://getgeopulse.com/results/sample',
};
