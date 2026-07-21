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

/** GEO-Pulse brand shell — the same visual identity as the built-in scorecard email. */
export function brandShell(innerHtml: string, pixelUrl: string): string {
  return [
    '<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#1a1a1a;">',
    `<p style="letter-spacing:0.2em;font-size:11px;color:#8a7a4a;">GEO-PULSE · AI SEARCH READINESS</p>`,
    innerHtml,
    `<p style="color:#999;font-size:12px;">— GEO-Pulse · editorial intelligence for AI search readiness</p>`,
    `<img src="${pixelUrl}" width="1" height="1" alt="" style="display:block;" />`,
    '</div>',
  ].join('\n');
}

/** Render a template into { subject, html } ready for sending. */
export function renderOutreachTemplate(
  template: Pick<OutreachTemplate, 'subjectTemplate' | 'bodyFormat' | 'bodyTemplate'>,
  vars: OutreachTemplateVars,
  pixelUrl: string
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

  return { subject, html: brandShell(body, pixelUrl) };
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
