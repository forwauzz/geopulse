/**
 * Orchestrates fetch → parse → registered checks → score (single responsibility: run one free scan).
 */
import type { CheckCategory, CheckResult, CheckStatus } from '../lib/interfaces/audit';
import type { LLMProvider } from '../lib/interfaces/providers';
import { extractDomain } from '../lib/ssrf';
import { fetchGateText } from '../lib/fetch-gate';
import { fetchPage } from './fetch-page';
import { buildTextSample, parsePageSignals } from './parse-signals';
import { buildDeterministicChecks, buildFreeTierChecks } from './checks/registry';
import {
  attachWeights,
  computeScore,
  computeCategoryScores,
  letterGrade,
  topFailedIssues,
  type CategoryScore,
} from './scoring';

export interface ScanIssueJson {
  check: string;
  checkId: string;
  weight: number;
  passed: boolean;
  status: CheckStatus;
  category: CheckCategory;
  finding: string;
  fix?: string;
  confidence?: 'high' | 'medium' | 'low';
}

export interface FreeScanOutput {
  score: number;
  letterGrade: string;
  issues: ScanIssueJson[];
  topIssues: ScanIssueJson[];
  categoryScores: CategoryScore[];
}

/**
 * Run audit checks on already-fetched HTML (deep crawl: one fetch per URL).
 */
export async function auditPageFromHtml(
  finalUrl: string,
  html: string,
  llm: LLMProvider,
  options: {
    useLlm: boolean;
    robotsTxtContent?: string;
    llmsTxtContent?: string;
    responseHeaders?: Record<string, string>;
  }
): Promise<FreeScanOutput> {
  const signals = parsePageSignals(html);
  const textSample = buildTextSample(html);
  const ctx = {
    signals,
    finalUrl,
    textSample,
    robotsTxtContent: options.robotsTxtContent ?? '',
    llmsTxtContent: options.llmsTxtContent ?? '',
    responseHeaders: options.responseHeaders ?? {},
  };

  const checks = options.useLlm ? buildFreeTierChecks(llm) : buildDeterministicChecks();
  const results: CheckResult[] = [];
  for (const c of checks) {
    results.push(await c.run(ctx));
  }

  const weighted = attachWeights(
    checks.map((c) => ({ weight: c.weight, category: c.category })),
    results
  );

  const score = computeScore(weighted);
  const lg = letterGrade(score);
  const categoryScores = computeCategoryScores(weighted);

  const mapIssue = (r: (typeof weighted)[number]): ScanIssueJson => ({
    check: checks.find((c) => c.id === r.id)?.name ?? r.id,
    checkId: r.id,
    weight: r.weight,
    passed: r.passed,
    status: r.status,
    category: r.category,
    finding: r.finding,
    fix: r.fix,
    confidence: r.confidence,
  });

  const issues: ScanIssueJson[] = weighted.map(mapIssue);

  const topWeighted = topFailedIssues(weighted, 3);
  const topIssues: ScanIssueJson[] = topWeighted.map(mapIssue);

  return {
    score,
    letterGrade: lg,
    issues,
    topIssues:
      topIssues.length > 0 ? topIssues : issues.filter((i) => !i.passed).slice(0, 3),
    categoryScores,
  };
}

async function fetchSideResource(baseUrl: string, path: string): Promise<string> {
  try {
    const origin = new URL(baseUrl).origin;
    const r = await fetchGateText(`${origin}${path}`, {
      maxBytes: 32_000,
      timeoutMs: 5_000,
      acceptHeader: 'text/plain,*/*',
    });
    return r.ok ? r.text : '';
  } catch {
    return '';
  }
}

export async function runFreeScan(url: string, llm: LLMProvider): Promise<
  | { ok: true; output: FreeScanOutput; finalUrl: string; domain: string }
  | { ok: false; reason: string }
> {
  const fetched = await fetchPage(url);
  if (!fetched.ok) return { ok: false, reason: fetched.reason };

  const [robotsTxtContent, llmsTxtContent] = await Promise.all([
    fetchSideResource(fetched.finalUrl, '/robots.txt'),
    fetchSideResource(fetched.finalUrl, '/llms.txt'),
  ]);

  const output = await auditPageFromHtml(fetched.finalUrl, fetched.html, llm, {
    useLlm: true,
    robotsTxtContent,
    llmsTxtContent,
  });

  const domain = extractDomain(fetched.finalUrl);
  if (!domain) return { ok: false, reason: 'Could not extract domain' };

  return {
    ok: true,
    finalUrl: fetched.finalUrl,
    domain,
    output,
  };
}
