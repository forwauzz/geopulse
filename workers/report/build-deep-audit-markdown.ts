import type { DeepAuditReportPayload } from './deep-audit-report-payload';
import type { IssueRow } from './build-deep-audit-pdf';

function parseIssues(raw: unknown): IssueRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is IssueRow => x !== null && typeof x === 'object');
}

/**
 * Markdown export for deep audit (same facts as PDF; version-controlled text).
 */
export function buildDeepAuditMarkdown(payload: DeepAuditReportPayload): string {
  const lines: string[] = [];
  lines.push('# GEO-Pulse — AI Search Readiness (Deep audit)');
  lines.push('');
  lines.push(`- **Domain:** ${payload.domain}`);
  lines.push(`- **URL:** ${payload.seedUrl}`);
  lines.push(
    `- **Score:** ${payload.aggregateScore ?? '—'}/100 (${payload.aggregateLetterGrade ?? '—'})`
  );
  lines.push(`- **Generated:** ${payload.generatedAt}`);
  lines.push('');

  const hi = parseIssues(payload.highlightedIssues);
  if (hi.length > 0) {
    lines.push('## Highlighted issues');
    lines.push('');
    for (const row of hi) {
      const title = row.check ?? row.checkId ?? 'Check';
      const st = row.passed === true ? 'PASS' : row.passed === false ? 'FAIL' : '—';
      lines.push(`- **${title}** [${st}]`);
      if (row.finding) lines.push(`  - ${row.finding}`);
    }
    lines.push('');
  }

  lines.push('## Pages scanned');
  lines.push('');
  for (const pg of payload.pages) {
    const sc =
      pg.score !== null && pg.score !== undefined
        ? `${pg.score}/100 (${pg.letterGrade ?? '—'})`
        : '—';
    lines.push(`- ${pg.url} — ${sc}${pg.section ? ` — _section ${pg.section}_` : ''}`);
  }
  lines.push('');

  lines.push('## Per-page checklist');
  lines.push('');
  for (const pg of payload.pages) {
    lines.push(`### ${pg.url}`);
    lines.push('');
    const pageIssues = parseIssues(pg.issuesJson);
    if (pageIssues.length === 0) {
      lines.push('_(no issue rows)_');
    } else {
      for (const row of pageIssues) {
        const title = row.check ?? row.checkId ?? 'Check';
        const st = row.passed === true ? 'PASS' : row.passed === false ? 'FAIL' : '—';
        lines.push(`- **${title}** [${st}]`);
        if (row.finding) lines.push(`  - ${row.finding}`);
        if (row.fix) lines.push(`  - Fix: ${row.fix}`);
      }
    }
    lines.push('');
  }

  lines.push(
    '---',
    '',
    '_This score reflects technical signals relevant to AI search readiness — not a prediction of rankings or citations._'
  );

  return lines.join('\n');
}
