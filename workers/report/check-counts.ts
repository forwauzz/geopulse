/**
 * The single source of truth for "X of Y checks" arithmetic (spec C1).
 *
 * Every surface — PDF, email, web report — must derive its counts from here so the
 * numbers reconcile by construction: passed + warning + failed + notTested === total.
 */

export interface CountableIssue {
  status?: string | null;
  passed?: boolean | null;
}

export interface CheckCounts {
  total: number;
  passed: number;
  warning: number;
  failed: number;
  notTested: number;
}

export function deriveCheckCounts(issues: readonly CountableIssue[]): CheckCounts {
  let passed = 0;
  let warning = 0;
  let failed = 0;
  let notTested = 0;

  for (const issue of issues) {
    const status = (issue.status ?? '').toUpperCase();
    if (status === 'NOT_EVALUATED' || status === 'BLOCKED') notTested += 1;
    else if (status === 'PASS' || (status === '' && issue.passed === true)) passed += 1;
    else if (status === 'WARNING' || status === 'LOW_CONFIDENCE') warning += 1;
    else failed += 1;
  }

  return { total: issues.length, passed, warning, failed, notTested };
}

/** Human summary that always accounts for every check. */
export function describeCheckCounts(c: CheckCounts): string {
  const parts = [`${String(c.passed)} of ${String(c.total)} checks passed`];
  if (c.warning > 0) parts.push(`${String(c.warning)} with warnings`);
  if (c.failed > 0) parts.push(`${String(c.failed)} failed`);
  if (c.notTested > 0) parts.push(`${String(c.notTested)} not tested`);
  return parts.join(', ');
}
