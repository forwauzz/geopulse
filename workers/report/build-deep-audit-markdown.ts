import type { CategoryScorePayload, DeepAuditReportPayload } from './deep-audit-report-payload';
import type { IssueRow } from './build-deep-audit-pdf';

const CATEGORY_LABELS: Record<string, string> = {
  ai_readiness: 'AI Readiness',
  extractability: 'Extractability',
  trust: 'Trust',
  demand_coverage: 'Demand Coverage',
  conversion_readiness: 'Conversion Readiness',
};

function parseIssues(raw: unknown): IssueRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is IssueRow => x !== null && typeof x === 'object');
}

function severityLabel(weight: number | undefined): string {
  if (!weight) return 'Low';
  if (weight >= 8) return 'High';
  if (weight >= 5) return 'Medium';
  return 'Low';
}

/**
 * Markdown export for deep audit — structured to match the branded PDF.
 */
export function buildDeepAuditMarkdown(payload: DeepAuditReportPayload): string {
  const lines: string[] = [];

  lines.push('# GEO-Pulse — AI Search Readiness Report');
  lines.push('');
  lines.push(`- **Domain:** ${payload.domain}`);
  lines.push(`- **URL:** ${payload.seedUrl}`);
  lines.push(
    `- **Score:** ${payload.aggregateScore ?? '—'}/100 (${payload.aggregateLetterGrade ?? '—'})`
  );
  lines.push(`- **Generated:** ${payload.generatedAt}`);
  lines.push(`- **Scan ID:** ${payload.scanId}`);
  lines.push('');

  const allIssues = parseIssues(payload.highlightedIssues);
  const totalChecks = allIssues.length;
  const passedChecks = allIssues.filter((i) => i.passed).length;
  const failedSorted = allIssues.filter((i) => !i.passed).sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));

  lines.push('## Executive Summary');
  lines.push('');
  const topIssueName = failedSorted[0]?.check ?? failedSorted[0]?.checkId ?? '';
  const score = payload.aggregateScore ?? 0;
  const grade = payload.aggregateLetterGrade ?? '—';
  lines.push(
    `Your site scored ${String(score)}/100 (${grade}). ${String(passedChecks)} of ${String(totalChecks)} checks passed. ${topIssueName ? `The most critical gap is: ${topIssueName}.` : 'No critical issues detected.'}`
  );
  lines.push('');

  const cats = payload.categoryScores;
  if (cats && cats.length > 0) {
    lines.push('## Category Breakdown');
    lines.push('');
    lines.push('| Category | Score | Grade | Checks |');
    lines.push('|----------|-------|-------|--------|');
    for (const cs of cats) {
      const label = CATEGORY_LABELS[cs.category] ?? cs.category;
      const scoreStr = cs.score >= 0 && cs.checkCount > 0 ? String(cs.score) : '—';
      const gradeStr = cs.score >= 0 && cs.checkCount > 0 ? cs.letterGrade : 'N/A';
      lines.push(`| ${label} | ${scoreStr} | ${gradeStr} | ${String(cs.checkCount)} |`);
    }
    lines.push('');
  }

  if (failedSorted.length > 0) {
    lines.push('## Priority Action Plan');
    lines.push('');
    for (let i = 0; i < failedSorted.length; i += 1) {
      const row = failedSorted[i]!;
      const title = row.check ?? row.checkId ?? 'Check';
      const sev = severityLabel(row.weight);
      lines.push(`${String(i + 1)}. **${title}** [${sev}]`);
      if (row.finding) lines.push(`   - ${row.finding}`);
      if (row.fix) lines.push(`   - **Fix:** ${row.fix}`);
    }
    lines.push('');
  }

  lines.push('## Score Breakdown — All Checks');
  lines.push('');
  lines.push('| Check | Status | Weight | Finding |');
  lines.push('|-------|--------|--------|---------|');
  for (const row of allIssues) {
    const title = row.check ?? row.checkId ?? 'Check';
    const st = row.passed ? 'PASS' : 'FAIL';
    const w = String(row.weight ?? 0);
    const finding = (row.finding ?? '').replace(/\|/g, '\\|').slice(0, 100);
    lines.push(`| ${title} | ${st} | ${w} | ${finding} |`);
  }
  lines.push('');

  lines.push('## Pages Scanned');
  lines.push('');
  for (const pg of payload.pages) {
    const sc =
      pg.score !== null && pg.score !== undefined
        ? `${String(pg.score)}/100 (${pg.letterGrade ?? '—'})`
        : '—';
    lines.push(`- **${pg.url}** — ${sc}${pg.section ? ` — _section ${pg.section}_` : ''}`);
  }
  lines.push('');

  if (payload.pages.length > 1) {
    lines.push('## Per-Page Checklist');
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
  }

  lines.push(
    '---',
    '',
    '_This score reflects technical signals relevant to AI search readiness — not a prediction of rankings or citations._'
  );

  return lines.join('\n');
}
