export const AI_CRAWLER_EXPLICIT_POLICY_DRIFT_PREFIX =
  'robots.txt allows every required search agent, but relies on a fallback policy for';

export function isAiCrawlerExplicitPolicyDrift(finding: string): boolean {
  return finding.startsWith(AI_CRAWLER_EXPLICIT_POLICY_DRIFT_PREFIX);
}
