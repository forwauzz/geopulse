/**
 * Owner Page builder (spec C9) — the first layer of the two-layer report.
 *
 * Written for a non-technical business owner: a plain-English verdict, what is
 * Blocked vs Not Tested, three quick wins with an operational owner and a verify
 * step, business exposure framing (never a fabricated dollar figure), and the
 * items we deliberately defer.
 */
import type { IssueRow } from './deep-audit-report-helpers';
import { deriveCheckCounts } from './check-counts';
import { remediationFor, type RemediationEntry } from './remediation-catalog';
import { bucketOf } from '../scan-engine/check-catalog';

export interface QuickWin {
  title: string;
  ownerRole: string;
  effort: string;
  diyOrHire: 'Do it yourself' | 'Delegate/hire';
  action: string;
  verify: string;
}

export interface OwnerPageData {
  verdict: string;
  blockedItems: string[];
  notTestedItems: string[];
  quickWins: QuickWin[];
  exposure: string;
  deferrals: string[];
}

function statusOf(row: IssueRow): string {
  return (row.status ?? (row.passed === true ? 'PASS' : 'FAIL')).toUpperCase();
}

function nameOf(row: IssueRow): string {
  return row.check ?? row.checkId ?? 'Check';
}

export function buildOwnerPage(input: {
  score: number;
  grade: string;
  issues: readonly IssueRow[];
}): OwnerPageData {
  const issues = [...input.issues];
  const counts = deriveCheckCounts(issues);

  const failed = issues.filter((r) => statusOf(r) === 'FAIL');
  const notTested = issues.filter((r) => ['NOT_EVALUATED', 'BLOCKED'].includes(statusOf(r)));
  const eligibilityFailed = failed.filter((r) => bucketOf(r.checkId ?? '') === 'eligibility');

  // Verdict — lead with the thing that gates everything else.
  let verdict: string;
  if (eligibilityFailed.length > 0) {
    verdict =
      `Your site scored ${String(input.score)}/100 (${input.grade}), but the score is not the headline: ` +
      `${String(eligibilityFailed.length)} access-level ${eligibilityFailed.length === 1 ? 'issue' : 'issues'} ` +
      'currently limit whether AI search engines can reach and cite you at all. Fix those first — everything else builds on them.';
  } else if (counts.notTested > 0) {
    verdict =
      `Your site scored ${String(input.score)}/100 (${input.grade}) on the checks we could run. ` +
      `${String(counts.notTested)} ${counts.notTested === 1 ? 'check was' : 'checks were'} not testable ` +
      '(see Not Tested below) — resolve the access question, then re-scan for a complete picture.';
  } else if (input.score >= 80 || counts.failed === 0) {
    verdict = `Your site scored ${String(input.score)}/100 (${input.grade}). The machinery is in good shape — the remaining items below are refinements, not repairs.`;
  } else {
    verdict =
      `Your site scored ${String(input.score)}/100 (${input.grade}). AI engines can reach you, ` +
      `but ${String(counts.failed)} ${counts.failed === 1 ? 'check' : 'checks'} below ${counts.failed === 1 ? 'makes' : 'make'} it harder for them to understand and cite you. The quick wins below are the fastest path up.`;
  }

  const blockedItems = failed
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .map((r) => `${nameOf(r)} — ${(r.finding ?? '').split('. ')[0] ?? ''}`.trim());

  const notTestedItems = notTested.map((r) => `${nameOf(r)} — not tested; see the access diagnosis for why.`);

  // Quick wins: failed checks whose remediation is tagged Quick Win, heaviest first.
  const withRemedy = failed
    .map((r) => ({ row: r, remedy: remediationFor(r.checkId ?? '') }))
    .filter((x): x is { row: IssueRow; remedy: RemediationEntry } => Boolean(x.remedy));
  // Only genuinely quick items may appear under "quick wins" — showing fewer than three
  // is more honest than dressing a Big Project up as one.
  const quickWinPool = withRemedy.filter((x) => x.remedy.effortImpact === 'Quick Win');
  const quickWins: QuickWin[] = quickWinPool
    .sort((a, b) => (b.row.weight ?? 0) - (a.row.weight ?? 0))
    .slice(0, 3)
    .map((x) => ({
      title: nameOf(x.row),
      ownerRole: x.remedy.ownerRole,
      effort: x.remedy.effort,
      diyOrHire: x.remedy.diy ? 'Do it yourself' : 'Delegate/hire',
      action: x.row.fix ?? x.remedy.copyPaste,
      verify: x.remedy.verify,
    }));

  // Exposure framing — qualitative, never a fabricated dollar amount.
  const exposure =
    eligibilityFailed.length > 0
      ? 'What this costs you: when a prospect asks ChatGPT, Perplexity, or Google AI for a provider like you, an access-blocked site is simply absent from the answer — the referral goes to a competitor the engine can read. AI-search referrals are still a small share of traffic, but they convert far better than classic search, and early fixes compound.'
      : 'What this costs you: every understanding gap below makes an AI engine slightly more likely to cite a competitor whose site is easier to parse. None of these is an emergency; together they decide who gets named in the answer.';

  // Explicit deferrals: hygiene misses + anything tagged Skip.
  const deferrals: string[] = [];
  for (const r of issues) {
    const remedy = remediationFor(r.checkId ?? '');
    if (!remedy) continue;
    const s = statusOf(r);
    if (remedy.effortImpact === 'Skip') {
      deferrals.push(`${nameOf(r)} — deliberately optional; no engine rewards it today.`);
    } else if (bucketOf(r.checkId ?? '') === 'hygiene' && (s === 'FAIL' || s === 'WARNING')) {
      deferrals.push(`${nameOf(r)} — worth fixing for general site quality, but it does not affect AI visibility, so it is not in your first 30 days.`);
    }
  }

  return { verdict, blockedItems, notTestedItems, quickWins, exposure, deferrals };
}
