import type { CategoryScorePayload, DeepAuditReportPayload } from './deep-audit-report-payload';
import {
  customerFacingFinding,
  deriveDemandCoverageSignals,
  parseIssues,
  scoreNarrative,
  summarizePageIssuePatterns,
  type IssueRow,
} from './deep-audit-report-helpers';

const CATEGORY_LABELS: Record<string, string> = {
  ai_readiness: 'AI Readiness',
  extractability: 'Extractability',
  trust: 'Trust',
  demand_coverage: 'Demand Coverage',
  conversion_readiness: 'Conversion Readiness',
};

function markdownInline(value: string): string {
  return value.replace(/\n+/g, ' ').trim();
}

function severityLabel(weight: number | undefined): string {
  if (!weight) return 'Low';
  if (weight >= 8) return 'High';
  if (weight >= 5) return 'Medium';
  return 'Low';
}

function ownerLabel(row: IssueRow): string {
  return row.teamOwner ?? 'Unassigned';
}

function issueStatusLabel(row: IssueRow): string {
  return row.status ?? (row.passed === true ? 'PASS' : row.passed === false ? 'FAIL' : '—');
}

function parseCoverageSummary(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function enrichIssues(primary: IssueRow[], fallback: IssueRow[]): IssueRow[] {
  const fallbackByKey = new Map<string, IssueRow>();
  for (const row of fallback) {
    const key = row.checkId ?? row.check ?? '';
    if (key && !fallbackByKey.has(key)) {
      fallbackByKey.set(key, row);
    }
  }

  return primary.map((row) => {
    const key = row.checkId ?? row.check ?? '';
    const base = key ? fallbackByKey.get(key) : undefined;
    if (!base) return row;
    return {
      ...base,
      ...row,
      teamOwner: row.teamOwner ?? base.teamOwner,
      finding: row.finding ?? base.finding,
      fix: row.fix ?? base.fix,
      weight: row.weight ?? base.weight,
    };
  });
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

  const allIssues = parseIssues(payload.allIssues);
  const topIssues = enrichIssues(parseIssues(payload.highlightedIssues), allIssues);
  const totalChecks = allIssues.length;
  const passedChecks = allIssues.filter((i) => issueStatusLabel(i) === 'PASS').length;
  const failedSorted = topIssues
    .filter((i) => issueStatusLabel(i) !== 'PASS' && issueStatusLabel(i) !== 'NOT_EVALUATED')
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  const strongestFailed = allIssues
    .filter((i) => issueStatusLabel(i) !== 'PASS' && issueStatusLabel(i) !== 'NOT_EVALUATED')
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))[0];
  const repeatedPagePatterns = summarizePageIssuePatterns(payload.pages);
  const demandCoverageSignals = deriveDemandCoverageSignals(allIssues);

  lines.push('## Executive Summary');
  lines.push('');
  const topIssueName = failedSorted[0]?.check ?? failedSorted[0]?.checkId ?? '';
  const firstMove = payload.immediateWins[0]?.what ?? failedSorted[0]?.fix ?? '';
  const score = payload.aggregateScore ?? 0;
  const grade = payload.aggregateLetterGrade ?? '—';
  lines.push(scoreNarrative(score, grade, totalChecks, passedChecks, topIssueName, firstMove));
  lines.push('');

  lines.push('## At a Glance');
  lines.push('');
  lines.push(`- **Overall score:** ${payload.aggregateScore ?? '—'}/100 (${payload.aggregateLetterGrade ?? '—'})`);
  lines.push(`- **Checks passed:** ${String(passedChecks)} of ${String(totalChecks)}`);
  if (strongestFailed) {
    lines.push(`- **Top blocker:** ${strongestFailed.check ?? strongestFailed.checkId ?? 'Check'}`);
    lines.push(`- **Primary owner:** ${ownerLabel(strongestFailed)}`);
  }
  if (payload.immediateWins[0]?.what) {
    lines.push(`- **First recommended move:** ${markdownInline(payload.immediateWins[0].what)}`);
  } else if (firstMove) {
    lines.push(`- **First recommended move:** ${markdownInline(firstMove)}`);
  }
  lines.push('');

  if (payload.immediateWins.length > 0) {
    lines.push('## Immediate Wins');
    lines.push('');
    for (let i = 0; i < payload.immediateWins.length; i += 1) {
      const win = payload.immediateWins[i]!;
      lines.push(`${String(i + 1)}. **${markdownInline(win.what)}**`);
      lines.push(`   - **Who:** ${win.who}`);
      lines.push(`   - **Why:** ${markdownInline(win.why)}`);
      lines.push(`   - **How:** ${markdownInline(win.how)}`);
      lines.push(`   - **Effort:** ${win.effort}`);
    }
    lines.push('');
  }

  if (failedSorted.length > 0) {
    lines.push('## Priority Action Plan');
    lines.push('');
    lines.push('Focus on these actions first before moving into lower-signal cleanup or broad content expansion.');
    lines.push('');
    for (let i = 0; i < failedSorted.length; i += 1) {
      const row = failedSorted[i]!;
      const title = row.check ?? row.checkId ?? 'Check';
      const sev = severityLabel(row.weight);
      const finding = customerFacingFinding(row);
      lines.push(`${String(i + 1)}. **${title}** [${sev}]`);
      lines.push(`   - **Owner:** ${ownerLabel(row)}`);
      if (finding) lines.push(`   - **Why it matters:** ${finding}`);
      if (row.fix) lines.push(`   - **First move:** ${row.fix}`);
    }
    lines.push('');
  }

  if (demandCoverageSignals.length > 0) {
    lines.push('## Question-Answer Readiness');
    lines.push('');
    lines.push(
      'This section summarizes whether key pages are currently shaped to answer likely buyer questions clearly enough for machine retrieval and reuse.'
    );
    lines.push('');
    for (let i = 0; i < demandCoverageSignals.length; i += 1) {
      const signal = demandCoverageSignals[i]!;
      lines.push(`${String(i + 1)}. **${signal.title}** [${signal.status}]`);
      lines.push(`   - ${signal.summary}`);
      if (signal.firstMove) {
        lines.push(`   - **First move:** ${signal.firstMove}`);
      }
    }
    lines.push('');
  }

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

  const coverage = parseCoverageSummary(payload.coverageSummary);
  if (coverage) {
    lines.push('## Coverage Summary');
    lines.push('');
    const fetched = coverage['pages_fetched'];
    const errored = coverage['pages_errored'];
    const planned = coverage['urls_planned'];
    const delay = coverage['crawl_delay_ms'];
    const chunksProcessed = coverage['chunks_processed'];
    const urlsRemaining = coverage['urls_remaining'];
    const chunkSize = coverage['chunk_size'];
    const robotsStatus = coverage['robots_status'];
    const browserRenderMode = coverage['browser_render_mode'];
    const browserRenderAttempted = coverage['browser_render_attempted'];
    const browserRenderSucceeded = coverage['browser_render_succeeded'];
    const browserRenderFailed = coverage['browser_render_failed'];
    const seedUrl = coverage['seed_url'];
    if (seedUrl) lines.push(`- **Seed URL:** ${String(seedUrl)}`);
    if (planned !== undefined) lines.push(`- **URLs planned:** ${String(planned)}`);
    if (fetched !== undefined) lines.push(`- **Pages fetched:** ${String(fetched)}`);
    if (errored !== undefined) lines.push(`- **Pages errored:** ${String(errored)}`);
    if (robotsStatus !== undefined) lines.push(`- **robots.txt status:** ${String(robotsStatus)}`);
    if (delay !== undefined) lines.push(`- **Crawl delay applied:** ${String(delay)}ms`);
    if (chunkSize !== undefined) lines.push(`- **Chunk size:** ${String(chunkSize)}`);
    if (chunksProcessed !== undefined) lines.push(`- **Chunks processed:** ${String(chunksProcessed)}`);
    if (urlsRemaining !== undefined) lines.push(`- **URLs remaining at completion:** ${String(urlsRemaining)}`);
    if (browserRenderMode !== undefined) lines.push(`- **Browser rendering mode:** ${String(browserRenderMode)}`);
    if (browserRenderAttempted !== undefined) lines.push(`- **Browser render attempts:** ${String(browserRenderAttempted)}`);
    if (browserRenderSucceeded !== undefined) lines.push(`- **Browser render successes:** ${String(browserRenderSucceeded)}`);
    if (browserRenderFailed !== undefined) lines.push(`- **Browser render fallbacks:** ${String(browserRenderFailed)}`);
    lines.push('');
  }

  lines.push('## Detailed Check Reference');
  lines.push('');
  lines.push('| Check | Status | Weight | Finding |');
  lines.push('|-------|--------|--------|---------|');
  for (const row of allIssues) {
    const title = row.check ?? row.checkId ?? 'Check';
    const st = issueStatusLabel(row);
    const w = String(row.weight ?? 0);
    const finding = customerFacingFinding(row).replace(/\|/g, '\\|').slice(0, 100);
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

  if (repeatedPagePatterns.length > 0) {
    lines.push('## Repeated Page Patterns');
    lines.push('');
    for (let i = 0; i < repeatedPagePatterns.length; i += 1) {
      const pattern = repeatedPagePatterns[i]!;
      lines.push(
        `${String(i + 1)}. **${pattern.checkName}** appears on ${String(pattern.affectedPages)} pages.`
      );
      if (pattern.sampleFinding) {
        lines.push(`   - ${pattern.sampleFinding}`);
      }
      lines.push(`   - Sample pages: ${pattern.sampleUrls.map((url) => markdownInline(url)).join(', ')}`);
    }
    lines.push('');
  }

  if (payload.pages.length > 1) {
    lines.push('## Page-Level Reference');
    lines.push('');
    for (const pg of payload.pages) {
      lines.push(`### ${pg.url}`);
      lines.push('');
      const pageIssues = parseIssues(pg.issuesJson).filter((row) => issueStatusLabel(row) !== 'PASS');
      if (pageIssues.length === 0) {
        lines.push('_(no non-passing issue rows)_');
      } else {
        for (const row of pageIssues) {
          const title = row.check ?? row.checkId ?? 'Check';
          const st = issueStatusLabel(row);
          const finding = customerFacingFinding(row);
          lines.push(`- **${title}** [${st}]`);
          if (finding) lines.push(`  - ${finding}`);
          if (row.fix && st !== 'PASS') lines.push(`  - Fix: ${row.fix}`);
        }
      }
      lines.push('');
    }
  }

  lines.push('## Technical Appendix');
  lines.push('');
  const appendix = payload.technicalAppendix;
  if (appendix?.robotsSummary) lines.push(`- **Robots / AI crawler access:** ${appendix.robotsSummary}`);
  if (appendix?.schemaSummary) lines.push(`- **Schema findings:** ${appendix.schemaSummary}`);
  if (appendix?.headersSummary) lines.push(`- **Security headers:** ${appendix.headersSummary}`);
  if (appendix?.robotsSummary || appendix?.schemaSummary || appendix?.headersSummary) lines.push('');
  if (coverage) {
    lines.push('- **Coverage payload:**');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(coverage, null, 2));
    lines.push('```');
    lines.push('');
  } else if (!(appendix?.robotsSummary || appendix?.schemaSummary || appendix?.headersSummary)) {
    lines.push('_(no technical appendix recorded)_');
    lines.push('');
  }

  lines.push(
    '---',
    '',
    '_This score reflects technical signals relevant to AI search readiness — not a prediction of rankings or citations._'
  );

  return lines.join('\n');
}
