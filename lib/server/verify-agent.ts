/**
 * Verify Agent — did the change actually help?
 *
 * The Fix Agent can only act for users whose site lives in a repo they connect. Everyone else
 * applies changes by hand and has no way to know whether it worked. This closes that loop for all
 * of them: re-audit, diff against the previous audit of the same domain, and report what moved.
 *
 * Same principle as the autoship gate in scripts/autonomous-ship.mjs — the answer is a measured
 * before/after, not a model's opinion of its own suggestion. Nothing here calls an LLM.
 *
 * The score alone is not enough to be useful: "78 → 81" does not tell anyone what to do next.
 * The check-level diff does, and it is also what catches the case the score hides — an overall
 * rise that quietly broke something that used to pass.
 */

export type ScanIssue = {
  check?: string;
  finding?: string;
  fix?: string;
  passed?: boolean;
  category?: string;
  weight?: number;
};

export type ScanSnapshot = {
  readonly id: string;
  readonly domain: string;
  readonly score: number | null;
  readonly createdAt: string;
  readonly issues: readonly ScanIssue[];
};

export type CheckChange = {
  readonly check: string;
  readonly category: string | null;
  /** What the check now says, for rendering next to the change. */
  readonly finding: string | null;
};

export type VerifyVerdict = 'improved' | 'unchanged' | 'regressed' | 'inconclusive';

export type VerifyResult = {
  readonly domain: string;
  readonly beforeScanId: string;
  readonly afterScanId: string;
  readonly beforeScore: number | null;
  readonly afterScore: number | null;
  /** null when either score is missing — never silently treated as zero. */
  readonly scoreDelta: number | null;
  readonly verdict: VerifyVerdict;
  /** Was failing, now passes. */
  readonly fixed: readonly CheckChange[];
  /** Was passing, now fails — surfaced even when the score went up. */
  readonly regressed: readonly CheckChange[];
  /** Failing in both audits. */
  readonly stillFailing: readonly CheckChange[];
  /** Present in the new audit only — a check that did not run before. */
  readonly newlyChecked: readonly CheckChange[];
};

function keyOf(issue: ScanIssue): string | null {
  const raw = issue.check?.trim();
  return raw ? raw.toLowerCase() : null;
}

function toChange(issue: ScanIssue): CheckChange {
  return {
    check: issue.check?.trim() ?? '',
    category: issue.category?.trim() ?? null,
    finding: issue.finding?.trim() ?? null,
  };
}

/**
 * Index by check name. Later entries win: a scan should not contain the same check twice, but if it
 * does, the last one is what the report showed the user.
 */
function indexIssues(issues: readonly ScanIssue[]): Map<string, ScanIssue> {
  const out = new Map<string, ScanIssue>();
  for (const issue of issues) {
    const key = keyOf(issue);
    if (key) out.set(key, issue);
  }
  return out;
}

/**
 * Compare two audits of the same domain.
 *
 * `passed` is deliberately compared as an explicit boolean. A check with an undefined result is
 * neither a pass nor a failure, and treating it as either would invent a change the user did not
 * make — so those are left out of every bucket rather than guessed at.
 */
export function diffScans(before: ScanSnapshot, after: ScanSnapshot): VerifyResult {
  const beforeIndex = indexIssues(before.issues);
  const afterIndex = indexIssues(after.issues);

  const fixed: CheckChange[] = [];
  const regressed: CheckChange[] = [];
  const stillFailing: CheckChange[] = [];
  const newlyChecked: CheckChange[] = [];

  for (const [key, afterIssue] of afterIndex) {
    const beforeIssue = beforeIndex.get(key);
    const now = afterIssue.passed;
    if (now !== true && now !== false) continue;

    if (!beforeIssue) {
      if (now === false) newlyChecked.push(toChange(afterIssue));
      continue;
    }

    const then = beforeIssue.passed;
    if (then !== true && then !== false) continue;

    if (then === false && now === true) fixed.push(toChange(afterIssue));
    else if (then === true && now === false) regressed.push(toChange(afterIssue));
    else if (then === false && now === false) stillFailing.push(toChange(afterIssue));
  }

  const scoreDelta =
    typeof before.score === 'number' && typeof after.score === 'number'
      ? after.score - before.score
      : null;

  return {
    domain: after.domain,
    beforeScanId: before.id,
    afterScanId: after.id,
    beforeScore: before.score,
    afterScore: after.score,
    scoreDelta,
    verdict: resolveVerdict(scoreDelta, regressed.length, fixed.length),
    fixed,
    regressed,
    stillFailing,
    newlyChecked,
  };
}

/**
 * The score decides, with one exception: a check that used to pass and now fails is called a
 * regression even when the total went up. Netting that away is how a site quietly loses something
 * it had while the headline number still looks like progress.
 */
function resolveVerdict(
  scoreDelta: number | null,
  regressedCount: number,
  fixedCount: number
): VerifyVerdict {
  if (regressedCount > 0) return 'regressed';
  if (scoreDelta === null) {
    // No comparable scores. Check-level movement is still a real answer; nothing at all is not.
    if (fixedCount > 0) return 'improved';
    return 'inconclusive';
  }
  if (scoreDelta > 0) return 'improved';
  if (scoreDelta < 0) return 'regressed';
  return fixedCount > 0 ? 'improved' : 'unchanged';
}

type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: unknown) => {
        eq: (column: string, value: unknown) => {
          order: (
            column: string,
            options?: { ascending?: boolean }
          ) => { limit: (n: number) => Promise<{ data: unknown[] | null; error: unknown }> };
        };
      };
    };
  };
};

type ScanRow = {
  id: string;
  domain: string | null;
  score: number | null;
  created_at: string;
  issues_json: unknown;
};

/**
 * The user's completed audits, newest first.
 *
 * Bounded rather than unbounded: a comparison only ever needs the two most recent audits per
 * domain, and a prolific account should not pull its whole history to render one card.
 */
export async function loadUserScans(
  supabase: SupabaseLike,
  userId: string,
  limit = 60
): Promise<ScanSnapshot[]> {
  try {
    const { data } = await supabase
      .from('scans')
      .select('id, domain, score, created_at, issues_json')
      .eq('user_id', userId)
      .eq('status', 'complete')
      .order('created_at', { ascending: false })
      .limit(limit);

    return ((data ?? []) as ScanRow[])
      .filter((row) => Boolean(row.domain))
      .map((row) => ({
        id: row.id,
        domain: row.domain as string,
        score: typeof row.score === 'number' ? row.score : null,
        createdAt: row.created_at,
        issues: Array.isArray(row.issues_json) ? (row.issues_json as ScanIssue[]) : [],
      }));
  } catch {
    return [];
  }
}

/**
 * Group audits by domain, newest first within each.
 *
 * A domain is only comparable once it has two audits — the agent has nothing to say about a site
 * audited once, and saying so is more useful than rendering an empty diff.
 */
export function groupByDomain(scans: readonly ScanSnapshot[]): Map<string, ScanSnapshot[]> {
  const out = new Map<string, ScanSnapshot[]>();
  for (const scan of scans) {
    const list = out.get(scan.domain);
    if (list) list.push(scan);
    else out.set(scan.domain, [scan]);
  }
  return out;
}

/** The newest comparison available for a domain, or null when there is no before-and-after yet. */
export function latestComparison(scans: readonly ScanSnapshot[]): VerifyResult | null {
  if (scans.length < 2) return null;
  const [after, before] = scans;
  if (!after || !before) return null;
  return diffScans(before, after);
}

/** One-line summary for an email, a PR comment, or the top of the card. */
export function summarize(result: VerifyResult): string {
  const parts: string[] = [];
  if (result.scoreDelta !== null && result.beforeScore !== null && result.afterScore !== null) {
    const sign = result.scoreDelta > 0 ? '+' : '';
    parts.push(`${result.beforeScore} → ${result.afterScore} (${sign}${result.scoreDelta})`);
  }
  if (result.fixed.length > 0) parts.push(`${result.fixed.length} fixed`);
  if (result.regressed.length > 0) parts.push(`${result.regressed.length} regressed`);
  if (result.stillFailing.length > 0) parts.push(`${result.stillFailing.length} still failing`);
  return parts.length > 0 ? parts.join(' · ') : 'no comparable results';
}
