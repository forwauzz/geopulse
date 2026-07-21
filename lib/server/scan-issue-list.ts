/**
 * The FULL check list for a scan. Deep audits rewrite `scans.issues_json` down to the top three
 * failed checks (for the score card), keeping the complete list in `full_results_json` — so any
 * consumer that wants "all checks" (report story donut, pass counts) must read from there first.
 * Free scans store the full list in both places, so the fallback chain is safe for every scan.
 */
export function fullIssueListFromScan(
  issuesJson: unknown,
  fullResultsJson: unknown
): unknown[] {
  if (fullResultsJson && typeof fullResultsJson === 'object') {
    const rec = fullResultsJson as Record<string, unknown>;
    if (Array.isArray(rec['allIssues']) && rec['allIssues'].length > 0) return rec['allIssues'];
    if (Array.isArray(rec['issues']) && rec['issues'].length > 0) return rec['issues'];
  }
  return Array.isArray(issuesJson) ? issuesJson : [];
}
