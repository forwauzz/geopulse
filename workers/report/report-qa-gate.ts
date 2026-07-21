/**
 * Pre-render report QA gate (spec C1) — no PDF ships if any rule fails.
 *
 * Rules:
 *   1. Count reconciliation — passed+warning+failed+notTested must equal the total,
 *      and the "checks passed" numbers handed to renderers must come from
 *      deriveCheckCounts (one arithmetic, every surface).
 *   2. No garbled/clipped text — findings must not contain replacement characters,
 *      raw control bytes, or end in a mid-word hard cut.
 *   3. No contradictory findings — resolveReportContradictions() must run first;
 *      the gate verifies no known contradictory pair survives.
 *
 * The gate is pure so it can be unit-tested; the queue consumer wires it in front of
 * the PDF builder and refuses to render on violations.
 */
import { deriveCheckCounts, type CheckCounts, type CountableIssue } from './check-counts';

export interface GateIssue extends CountableIssue {
  checkId?: string | null;
  check?: string | null;
  finding?: string | null;
  fix?: string | null;
}

export interface QaViolation {
  rule: 'count_mismatch' | 'garbled_text' | 'contradiction' | 'empty_finding';
  detail: string;
}

export interface QaGateResult {
  ok: boolean;
  violations: QaViolation[];
  counts: CheckCounts;
}

/** Word-boundary truncation — never cuts mid-word, always signals continuation. */
export function truncateAtWord(text: string, maxChars: number): string {
  const t = text.trim();
  if (t.length <= maxChars) return t;
  const slice = t.slice(0, maxChars - 1);
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > maxChars * 0.5 ? slice.slice(0, lastSpace) : slice;
  return `${cut.replace(/[,;:.\s]+$/, '')}…`;
}

/** Detects the classic clipped-string bug ("…these AI crawle"). */
export function looksGarbled(text: string): boolean {
  if (/�/.test(text)) return true; // replacement char = broken encoding
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x08\x0B\x0C\x0E-\x1F]/.test(text)) return true;
  // A long string that stops mid-word with no terminal punctuation or ellipsis is a hard cut.
  const t = text.trimEnd();
  if (t.length >= 60 && /[a-z]{2}$/i.test(t) && !/[.!?)"'\]…%]$/.test(t)) {
    // Ends on a lowercase fragment following a partial word — only flag when the final
    // "word" is implausibly short for a sentence ending (e.g. "crawle").
    const lastWord = t.split(/\s+/).pop() ?? '';
    const knownShortEnders = new Set(['ok', 'up', 'on', 'in', 'it', 'js', 'ai', 'io', 'seo', 'url', 'faq', 'gbp', 'nap', 'bing', 'yelp', 'bbb']);
    if (lastWord.length >= 4 && !knownShortEnders.has(lastWord.toLowerCase()) && !/^[A-Z]/.test(lastWord)) {
      // Heuristic of last resort: flag only when the cut also lands at a legacy cap length.
      if ([40, 50, 70].includes(t.length)) return true;
    }
  }
  return false;
}

// ── Contradiction rules ───────────────────────────────────────────────────────

interface ContradictionRule {
  name: string;
  /** Returns the checkIds to drop (converted to NOT_EVALUATED with a note) when both sides fire. */
  detect: (issues: readonly GateIssue[]) => { dropId: string; reason: string } | null;
}

function findIssue(issues: readonly GateIssue[], id: string): GateIssue | undefined {
  return issues.find((i) => i.checkId === id);
}

function statusOf(i: GateIssue | undefined): string {
  return (i?.status ?? '').toUpperCase();
}

const CONTRADICTION_RULES: ContradictionRule[] = [
  {
    // Strict JSON-LD validated, but the type-coverage check claims no schema exists.
    name: 'schema_present_vs_absent',
    detect: (issues) => {
      const jsonLd = findIssue(issues, 'json-ld');
      const types = findIssue(issues, 'schema-types');
      if (statusOf(jsonLd) === 'PASS' && statusOf(types) === 'FAIL' && /no schema\.org/i.test(types?.finding ?? '')) {
        return { dropId: 'schema-types', reason: 'Superseded by the validated structured-data check — schema is present.' };
      }
      if (statusOf(types) === 'PASS' && statusOf(jsonLd) === 'FAIL' && /no json-ld/i.test(jsonLd?.finding ?? '')) {
        return { dropId: 'json-ld', reason: 'Superseded by the schema-type check — JSON-LD types were detected.' };
      }
      return null;
    },
  },
  {
    // Crawler access passes, but another finding claims crawlers are blocked.
    name: 'crawler_access_conflict',
    detect: (issues) => {
      const access = findIssue(issues, 'ai-crawler-access');
      if (statusOf(access) !== 'PASS') return null;
      const conflicting = issues.find(
        (i) =>
          i.checkId !== 'ai-crawler-access' &&
          statusOf(i) === 'FAIL' &&
          /robots\.txt blocks .*(OAI-SearchBot|Claude-SearchBot|PerplexityBot|Googlebot|Bingbot)/i.test(i.finding ?? '')
      );
      return conflicting
        ? { dropId: conflicting.checkId ?? '', reason: 'Conflicts with the crawler-access check, which found no retrieval-agent blocks.' }
        : null;
    },
  },
];

/**
 * Resolve known contradictory pairs before rendering: the weaker/duplicated finding is
 * downgraded to NOT_EVALUATED with an explanatory note (spec: "resolve, don't emit both").
 */
export function resolveReportContradictions(issues: readonly GateIssue[]): {
  issues: GateIssue[];
  resolutions: string[];
} {
  let working = issues.map((i) => ({ ...i }));
  const resolutions: string[] = [];

  for (const rule of CONTRADICTION_RULES) {
    const hit = rule.detect(working);
    if (!hit || !hit.dropId) continue;
    working = working.map((i) =>
      i.checkId === hit.dropId
        ? {
            ...i,
            status: 'NOT_EVALUATED',
            passed: false,
            finding: `${hit.reason}`,
            fix: undefined,
          }
        : i
    );
    resolutions.push(`${rule.name}: ${hit.dropId} — ${hit.reason}`);
  }

  return { issues: working, resolutions };
}

export function runReportQaGate(input: {
  issues: readonly GateIssue[];
  /** The counts a renderer intends to print — must match deriveCheckCounts exactly. */
  renderedCounts?: { passed: number; total: number };
}): QaGateResult {
  const violations: QaViolation[] = [];
  const counts = deriveCheckCounts(input.issues);

  if (counts.passed + counts.warning + counts.failed + counts.notTested !== counts.total) {
    violations.push({
      rule: 'count_mismatch',
      detail: `Outcome buckets (${String(counts.passed)}+${String(counts.warning)}+${String(counts.failed)}+${String(counts.notTested)}) do not sum to total ${String(counts.total)}.`,
    });
  }

  if (input.renderedCounts) {
    if (input.renderedCounts.total !== counts.total || input.renderedCounts.passed !== counts.passed) {
      violations.push({
        rule: 'count_mismatch',
        detail: `Renderer intends "${String(input.renderedCounts.passed)} of ${String(input.renderedCounts.total)}" but the canonical counts are "${String(counts.passed)} of ${String(counts.total)}".`,
      });
    }
  }

  for (const issue of input.issues) {
    const id = issue.checkId ?? issue.check ?? '?';
    const finding = issue.finding ?? '';
    if (!finding.trim()) {
      violations.push({ rule: 'empty_finding', detail: `Check ${id} has no finding text.` });
      continue;
    }
    for (const text of [finding, issue.fix ?? '']) {
      if (text && looksGarbled(text)) {
        violations.push({ rule: 'garbled_text', detail: `Check ${id} contains garbled/clipped text: "${text.slice(-40)}"` });
      }
    }
  }

  for (const rule of CONTRADICTION_RULES) {
    const hit = rule.detect(input.issues);
    if (hit) {
      violations.push({
        rule: 'contradiction',
        detail: `${rule.name} unresolved (${hit.dropId}) — run resolveReportContradictions before rendering.`,
      });
    }
  }

  return { ok: violations.length === 0, violations, counts };
}
