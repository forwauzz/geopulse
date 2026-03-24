/**
 * Orchestrates fetch → parse → registered checks → score (single responsibility: run one free scan).
 */
import type { CheckResult } from '../lib/interfaces/audit';
import type { LLMProvider } from '../lib/interfaces/providers';
import { extractDomain } from '../lib/ssrf';
import { fetchPage } from './fetch-page';
import { buildTextSample, parsePageSignals } from './parse-signals';
import { buildFreeTierChecks } from './checks/registry';
import { attachWeights, computeScore, letterGrade, topFailedIssues } from './scoring';

export interface ScanIssueJson {
  check: string;
  checkId: string;
  weight: number;
  passed: boolean;
  finding: string;
  fix?: string;
}

export interface FreeScanOutput {
  score: number;
  letterGrade: string;
  issues: ScanIssueJson[];
  topIssues: ScanIssueJson[];
}

export async function runFreeScan(url: string, llm: LLMProvider): Promise<
  | { ok: true; output: FreeScanOutput; finalUrl: string; domain: string }
  | { ok: false; reason: string }
> {
  const fetched = await fetchPage(url);
  if (!fetched.ok) return { ok: false, reason: fetched.reason };

  const signals = parsePageSignals(fetched.html);
  const textSample = buildTextSample(fetched.html);
  const ctx = { signals, finalUrl: fetched.finalUrl, textSample };

  const checks = buildFreeTierChecks(llm);
  const results: CheckResult[] = [];
  for (const c of checks) {
    results.push(await c.run(ctx));
  }

  const weighted = attachWeights(
    checks.map((c) => ({ weight: c.weight })),
    results
  );

  const score = computeScore(weighted);
  const lg = letterGrade(score);

  const issues: ScanIssueJson[] = weighted.map((r) => ({
    check: checks.find((c) => c.id === r.id)?.name ?? r.id,
    checkId: r.id,
    weight: r.weight,
    passed: r.passed,
    finding: r.finding,
    fix: r.fix,
  }));

  const topWeighted = topFailedIssues(weighted, 3);
  const topIssues: ScanIssueJson[] = topWeighted.map((r) => ({
    check: checks.find((c) => c.id === r.id)?.name ?? r.id,
    checkId: r.id,
    weight: r.weight,
    passed: r.passed,
    finding: r.finding,
    fix: r.fix,
  }));

  const domain = extractDomain(fetched.finalUrl);
  if (!domain) return { ok: false, reason: 'Could not extract domain' };

  return {
    ok: true,
    finalUrl: fetched.finalUrl,
    domain,
    output: {
      score,
      letterGrade: lg,
      issues,
      topIssues:
        topIssues.length > 0 ? topIssues : issues.filter((i) => !i.passed).slice(0, 3),
    },
  };
}
