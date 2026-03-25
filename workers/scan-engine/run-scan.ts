/**
 * Orchestrates fetch → parse → registered checks → score (single responsibility: run one free scan).
 */
import type { CheckResult } from '../lib/interfaces/audit';
import type { LLMProvider } from '../lib/interfaces/providers';
import { extractDomain } from '../lib/ssrf';
import { fetchPage } from './fetch-page';
import { buildTextSample, parsePageSignals } from './parse-signals';
import { buildDeterministicChecks, buildFreeTierChecks } from './checks/registry';
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

/**
 * Run audit checks on already-fetched HTML (deep crawl: one fetch per URL).
 */
export async function auditPageFromHtml(
  finalUrl: string,
  html: string,
  llm: LLMProvider,
  options: { useLlm: boolean }
): Promise<FreeScanOutput> {
  const signals = parsePageSignals(html);
  const textSample = buildTextSample(html);
  const ctx = { signals, finalUrl, textSample };

  const checks = options.useLlm ? buildFreeTierChecks(llm) : buildDeterministicChecks();
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

  return {
    score,
    letterGrade: lg,
    issues,
    topIssues:
      topIssues.length > 0 ? topIssues : issues.filter((i) => !i.passed).slice(0, 3),
  };
}

export async function runFreeScan(url: string, llm: LLMProvider): Promise<
  | { ok: true; output: FreeScanOutput; finalUrl: string; domain: string }
  | { ok: false; reason: string }
> {
  const fetched = await fetchPage(url);
  if (!fetched.ok) return { ok: false, reason: fetched.reason };

  const output = await auditPageFromHtml(fetched.finalUrl, fetched.html, llm, { useLlm: true });

  const domain = extractDomain(fetched.finalUrl);
  if (!domain) return { ok: false, reason: 'Could not extract domain' };

  return {
    ok: true,
    finalUrl: fetched.finalUrl,
    domain,
    output,
  };
}
