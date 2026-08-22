/**
 * Outreach message templates (spec §9) — admin-authored subject/body with variables,
 * rendered into the branded email shell.
 *
 * Variables: {{name}} {{company}} {{domain}} {{score}} {{grade}} {{top_issues}} {{report_url}} {{report_thumbnail}} {{walkthrough_url}} {{personalization_reason}} {{personalization_source_url}}
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
import { ctaButton, emailShell, issueListHtml, scoreBlock } from './email-theme';

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
  siteUrl?: string | null;
  score: number;
  grade: string;
  topIssues: ReadonlyArray<{ check?: string; fix?: string }>;
  scanCompletedAt: string | null;
  passedChecks?: number | null;
  totalChecks?: number | null;
  eligibleDestinations?: number | null;
  testedDestinations?: number | null;
  retrievalScore?: number | null;
  understandingTrustScore?: number | null;
  reportUrl: string;
  reportThumbnailUrl?: string | null;
  walkthroughUrl: string;
  personalizationReason: string | null;
  personalizationSourceUrl: string | null;
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

function scanPreviewHtml(vars: OutreachTemplateVars): string {
  if (
    !vars.siteUrl ||
    !vars.scanCompletedAt ||
    vars.topIssues.length < 2 ||
    typeof vars.passedChecks !== 'number' ||
    typeof vars.totalChecks !== 'number' ||
    typeof vars.eligibleDestinations !== 'number' ||
    typeof vars.testedDestinations !== 'number' ||
    typeof vars.retrievalScore !== 'number' ||
    typeof vars.understandingTrustScore !== 'number'
  ) return '';
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Toronto',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(vars.scanCompletedAt));
  const exactUrl = escapeHtml(vars.siteUrl);
  const verificationPlan = {
    check: 'Verify the change',
    fix: `Publish the two changes, then re-run ${vars.domain} and compare these same checks against this baseline.`,
  };
  return [
    '<div style="margin:22px 0;padding:20px;border:1px solid #E5E9E9;border-radius:12px;background:#FAFBFB;">',
    `<p style="margin:0 0 10px;color:#586162;font-family:Arial,sans-serif;font-size:12px;line-height:1.55;"><strong style="color:#2C3435;">Scanned URL:</strong> <a href="${exactUrl}" style="color:#565E74;">${exactUrl}</a><br/><strong style="color:#2C3435;">Completed:</strong> ${escapeHtml(date)}</p>`,
    scoreBlock(vars.score, vars.grade, 'Public-site readiness result'),
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 0;border-collapse:separate;border-spacing:6px 0;">',
    `<tr><td style="width:33%;padding:10px 8px;background:#FFFFFF;border:1px solid #E5E9E9;border-radius:8px;text-align:center;font-family:Arial,sans-serif;"><strong style="display:block;color:#1A1A1A;font-size:16px;">${String(vars.passedChecks)}/${String(vars.totalChecks)}</strong><span style="color:#586162;font-size:11px;">checks passed</span></td>`,
    `<td style="width:33%;padding:10px 8px;background:#FFFFFF;border:1px solid #E5E9E9;border-radius:8px;text-align:center;font-family:Arial,sans-serif;"><strong style="display:block;color:#1A1A1A;font-size:16px;">${String(vars.eligibleDestinations)}/${String(vars.testedDestinations)}</strong><span style="color:#586162;font-size:11px;">retrieval destinations eligible</span></td>`,
    `<td style="width:34%;padding:10px 8px;background:#FFFFFF;border:1px solid #E5E9E9;border-radius:8px;text-align:center;font-family:Arial,sans-serif;"><strong style="display:block;color:#1A1A1A;font-size:16px;">${String(vars.retrievalScore)} vs ${String(vars.understandingTrustScore)}</strong><span style="color:#586162;font-size:11px;">retrieval vs understanding</span></td></tr></table>`,
    `<p style="margin:14px 0 0;color:#2C3435;font-family:Arial,sans-serif;font-size:13px;line-height:1.55;">What this means: access is the stronger side of this scan. Retrieval scored <strong>${String(vars.retrievalScore)}/100</strong>; AI Understanding &amp; Trust scored <strong>${String(vars.understandingTrustScore)}/100</strong>. The first work should improve how clearly the site describes and structures the business, then verify the same URL again.</p>`,
    issueListHtml([...vars.topIssues.slice(0, 2), verificationPlan], 'A practical first pass'),
    '<p style="margin:16px 0 0;color:#586162;font-family:Arial,sans-serif;font-size:12px;line-height:1.55;">This is a technical readiness snapshot of public evidence, not a promise of rankings or citations. The full PDF is intentionally not attached.</p>',
    '</div>',
  ].join('');
}

function richBlocks(vars: OutreachTemplateVars): Readonly<Record<string, string>> {
  const reportThumbnail = vars.reportThumbnailUrl
    ? [
        '<div style="margin:22px 0 18px;text-align:center;">',
        `<a href="${escapeHtml(vars.reportUrl)}" style="display:block;text-decoration:none;" aria-label="Open the private audit prepared for ${escapeHtml(vars.company ?? vars.domain)}">`,
        `<img src="${escapeHtml(vars.reportThumbnailUrl)}" width="480" alt="First page of the private audit prepared for ${escapeHtml(vars.company ?? vars.domain)}" style="display:block;width:100%;max-width:480px;height:auto;margin:0 auto;border:1px solid #D9DEDE;border-radius:8px;box-shadow:0 8px 24px rgba(26,26,26,0.10);"/>`,
        '</a>',
        `<p style="margin:10px 0 0;color:#586162;font-family:Arial,sans-serif;font-size:12px;line-height:1.5;"><a href="${escapeHtml(vars.reportUrl)}" style="color:#565E74;font-weight:700;">Open your private 10-page audit</a></p>`,
        '</div>',
      ].join('')
    : '';
  return {
    '{{top_issues}}': topIssuesHtml(vars.topIssues),
    '{{report_thumbnail}}': reportThumbnail,
    '{{scan_preview}}': scanPreviewHtml(vars),
    '{{walkthrough_cta}}': ctaButton('Review the scan with us', vars.walkthroughUrl),
  };
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
    .replaceAll('{{report_thumbnail}}', opts.escape ? '{{report_thumbnail}}' : vars.reportThumbnailUrl ?? '')
    .replaceAll('{{walkthrough_url}}', vars.walkthroughUrl)
    .replaceAll('{{personalization_reason}}', esc(vars.personalizationReason ?? 'This site matches the current audit cohort.'))
    .replaceAll('{{personalization_source_url}}', vars.personalizationSourceUrl ?? '')
    .replaceAll('{{scan_preview}}', opts.escape ? '{{scan_preview}}' : `${String(vars.score)}/100 (grade ${vars.grade})`)
    .replaceAll('{{walkthrough_cta}}', opts.escape ? '{{walkthrough_cta}}' : vars.walkthroughUrl)
    .replaceAll('{{top_issues}}', opts.escape
      ? '{{top_issues}}'
      : vars.topIssues.map((issue) => issue.check ?? '').filter(Boolean).join('; '));
}

/**
 * GEO-Pulse brand shell — delegates to the ONE email design system (issue #106).
 * CASL: the footer is part of the shell so no template — however custom — can ship
 * a commercial email without identification and a working unsubscribe (issue #97).
 */
export function brandShell(
  innerHtml: string,
  pixelUrl: string,
  unsubscribeUrl?: string,
  previewText?: string,
): string {
  return emailShell({
    kicker: 'AI search readiness',
    bodyHtml: innerHtml,
    previewText,
    sender: 'elena',
    signoff: 'Regards,',
    confidentialityNotice: true,
    unsubscribeUrl,
    pixelUrl,
  });
}

/** Render a template into { subject, html } ready for sending. */
export function renderOutreachTemplate(
  template: Pick<OutreachTemplate, 'subjectTemplate' | 'bodyFormat' | 'bodyTemplate'> & { readonly previewText?: string },
  vars: OutreachTemplateVars,
  pixelUrl: string,
  unsubscribeUrl?: string
): { subject: string; html: string; previewText: string } {
  const subject = substitute(template.subjectTemplate, vars, { escape: false });
  const previewText = template.previewText
    ? substitute(template.previewText, vars, { escape: false })
    : '';

  let body: string;
  if (template.bodyFormat === 'html') {
    body = substitute(template.bodyTemplate, vars, { escape: true });
    for (const [token, html] of Object.entries(richBlocks(vars))) body = body.replaceAll(token, html);
  } else {
    // Plain text: substitute with escaped values on the escaped body, then paragraphize.
    const escaped = escapeHtml(template.bodyTemplate);
    // Escaping turned {{...}} braces into themselves (braces are not escaped), so
    // substitution still works; values get escaped, the issues block stays HTML.
    const substituted = substitute(escaped, vars, { escape: true });
    const blocks = richBlocks(vars);
    body = substituted
      .split(/\n{2,}/)
      .map((paragraph) => {
        const trimmed = paragraph.trim();
        if (trimmed in blocks) return blocks[trimmed];
        let rendered = paragraph.replaceAll('\n', '<br/>');
        for (const [token, html] of Object.entries(blocks)) rendered = rendered.replaceAll(token, html);
        return `<p>${rendered}</p>`;
      })
      .join('\n');
  }

  return { subject, html: brandShell(body, pixelUrl, unsubscribeUrl, previewText), previewText };
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
    key: 'msp-evidence-first',
    name: 'MSP baseline offer - evidence before claims',
    description: 'MSP-specific first touch that offers a baseline without pretending an audit already exists.',
    subject: '{{company}}: one AI visibility baseline for {{domain}}',
    bodyFormat: 'text',
    body: `Hi {{name}},

When a business asks an AI assistant for a managed IT provider, the answer depends on what the system can retrieve and verify about each company.

GEO-Pulse measures that for MSPs. We check the public signals on {{domain}}, run blind buyer questions across supported answer engines, and return the evidence behind each finding: what was observed, where a competitor appeared, and what to fix first.

It is a baseline, not a promise of rankings or citations.

Would it be useful if I prepared the first baseline for {{company}}? You can also see the short walkthrough here: {{walkthrough_url}}`,
  },
  {
    key: 'first-scorecard',
    name: 'First scorecard - the evidence opener',
    description: 'First touch grounded in an already-completed public-site audit.',
    subject: 'We audited {{domain}} - AI-search readiness {{score}}/100',
    bodyFormat: 'text',
    body: `Hi {{name}},

We ran a public-site AI-search readiness audit of {{domain}}. It checks observable access, structure, content, and trust signals; it does not claim to reproduce an answer engine's private ranking logic.

The site scored {{score}}/100 (grade {{grade}}). The highest-confidence gaps were:

{{top_issues}}

The full report is free to view, with no account required: {{report_url}}

Prefer to talk through it? Request a focused walkthrough here: {{walkthrough_url}}`,
  },
  {
    key: 'monthly-pulse',
    name: 'Monthly pulse - the returning cadence',
    description: 'For an existing recurring audit: what changed and the next observed gap.',
    subject: '{{domain}} this month: AI-search readiness {{score}}/100',
    bodyFormat: 'text',
    body: `Hi {{name}},

The latest public-site readiness audit for {{domain}} is in: {{score}}/100 (grade {{grade}}).

The current highest-confidence gaps are:

{{top_issues}}

See the full observed breakdown: {{report_url}}

If you want help choosing the first change, request a focused walkthrough: {{walkthrough_url}}`,
  },
  {
    key: 'quick-wins',
    name: 'Priority gaps - the nudge',
    description: 'Short follow-up: observed gaps, one report, one human next step.',
    subject: 'Three observed gaps on {{domain}}',
    bodyFormat: 'text',
    body: `Hi {{name}},

The latest audit found three public-site signals worth reviewing on {{domain}}:

{{top_issues}}

See the supporting checks and practical next steps here: {{report_url}}

Want a person to help pick the first one? {{walkthrough_url}}`,
  },
  {
    key: 'plain-personal',
    name: 'Plain & personal - the founder note',
    description: 'Concise one-to-one note with an evidence boundary and explicit reply path.',
    subject: 'A public-site audit of {{domain}}',
    bodyFormat: 'text',
    body: `Hi {{name}},

I run GEO-Pulse. We audit the public signals that help search and AI systems access and understand a business website.

I ran {{domain}} through it. The current readiness score is {{score}}/100. That is a summary of observable site checks, not a promise of rankings or citations.

The report is free to view, with no sign-up: {{report_url}}

If you want, request a focused walkthrough and I will point to the first two changes I would review: {{walkthrough_url}}`,
  },
];
/** Sample variables for the admin preview. */
export const SAMPLE_TEMPLATE_VARS: OutreachTemplateVars = {
  name: 'Alex',
  company: 'Acme IT Services',
  domain: 'acme-it.example',
  siteUrl: 'https://acme-it.example/',
  score: 61,
  grade: 'D',
  topIssues: [
    { check: 'AI retrieval agent access', fix: 'Allow OAI-SearchBot, Claude-SearchBot and PerplexityBot in robots.txt.' },
    { check: 'Structured data validity', fix: 'Add LocalBusiness schema with your name and address.' },
  ],
  scanCompletedAt: '2026-08-08T20:00:00.000Z',
  passedChecks: 20,
  totalChecks: 24,
  eligibleDestinations: 5,
  testedDestinations: 5,
  retrievalScore: 100,
  understandingTrustScore: 62,
  reportUrl: 'https://getgeopulse.com/results/sample',
  reportThumbnailUrl: 'https://getgeopulse.com/api/audit-preview/thumbnail/sample',
  walkthroughUrl: 'https://getgeopulse.com/walkthrough?source=outreach',
  personalizationReason: 'The site matches the current managed-services audit cohort.',
  personalizationSourceUrl: 'https://acme-it.example/about',
};
