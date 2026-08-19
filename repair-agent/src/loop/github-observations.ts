import type { CheckConclusion, GitHubRequiredCheckObservation, GitHubRoleObservation, PullRequestObservation } from './contracts';

function record(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${field} is invalid`);
  return value as Record<string, unknown>;
}

function text(value: unknown, field: string, pattern: RegExp): string {
  if (typeof value !== 'string' || !pattern.test(value)) throw new Error(`${field} is invalid`);
  return value;
}

function positiveInteger(value: unknown, field: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new Error(`${field} is invalid`);
  return Number(value);
}

export function parseGitHubCheckRunObservation(args: {
  raw: unknown;
  role: 'reviewer' | 'qa' | 'merge-controller';
  repository: string;
  observedAt: string;
}): GitHubRoleObservation {
  const raw = record(args.raw, 'GitHub check run');
  const app = record(raw['app'], 'GitHub check-run app');
  const conclusion = raw['conclusion'] === null ? 'pending' : raw['conclusion'];
  if (!['success', 'failure', 'cancelled', 'skipped', 'pending'].includes(String(conclusion))) throw new Error('GitHub check-run conclusion is invalid');
  if (Number.isNaN(Date.parse(args.observedAt))) throw new Error('GitHub check-run observation time is invalid');
  return {
    provider: 'github',
    role: args.role,
    repository: text(args.repository, 'GitHub repository', /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    appSlug: text(app['slug'], 'GitHub check-run app slug', /^[A-Za-z0-9-]{1,50}$/),
    appId: positiveInteger(app['id'], 'GitHub check-run app ID'),
    checkRunId: positiveInteger(raw['id'], 'GitHub check-run ID'),
    headSha: text(raw['head_sha'], 'GitHub check-run head SHA', /^[a-f0-9]{40}$/),
    conclusion: conclusion as CheckConclusion,
    observedAt: args.observedAt,
  };
}

export function parseGitHubRequiredCheckObservation(args: {
  raw: unknown;
  repository: string;
  observedAt: string;
}): GitHubRequiredCheckObservation {
  const raw = record(args.raw, 'GitHub required check run');
  const app = record(raw['app'], 'GitHub required check-run app');
  const conclusion = raw['conclusion'] === null ? 'pending' : raw['conclusion'];
  if (!['success', 'failure', 'cancelled', 'skipped', 'pending'].includes(String(conclusion))) throw new Error('GitHub required check-run conclusion is invalid');
  if (Number.isNaN(Date.parse(args.observedAt))) throw new Error('GitHub required check-run observation time is invalid');
  return {
    provider: 'github',
    repository: text(args.repository, 'GitHub repository', /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    checkName: text(raw['name'], 'GitHub check-run name', /^[A-Za-z0-9_. /-]{1,100}$/),
    appSlug: text(app['slug'], 'GitHub required check-run app slug', /^[A-Za-z0-9-]{1,50}$/),
    appId: positiveInteger(app['id'], 'GitHub required check-run app ID'),
    checkRunId: positiveInteger(raw['id'], 'GitHub required check-run ID'),
    headSha: text(raw['head_sha'], 'GitHub required check-run head SHA', /^[a-f0-9]{40}$/),
    conclusion: conclusion as CheckConclusion,
    observedAt: args.observedAt,
  };
}

export function parseGitHubPullRequestObservation(args: {
  raw: unknown;
  repository: string;
  linkedIssueNumbers: readonly number[];
  observedAt: string;
}): PullRequestObservation {
  const raw = record(args.raw, 'GitHub pull request');
  const base = record(raw['base'], 'GitHub pull-request base');
  const head = record(raw['head'], 'GitHub pull-request head');
  const state = raw['state'];
  if (state !== 'open' && state !== 'closed') throw new Error('GitHub pull-request state is invalid');
  if (typeof raw['mergeable'] !== 'boolean') throw new Error('GitHub pull-request mergeability is unresolved');
  if (Number.isNaN(Date.parse(args.observedAt))) throw new Error('GitHub pull-request observation time is invalid');
  const linkedIssueNumbers = [...new Set(args.linkedIssueNumbers.map((value) => positiveInteger(value, 'GitHub linked issue number')))];
  return {
    repository: text(args.repository, 'GitHub repository', /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    number: positiveInteger(raw['number'], 'GitHub pull-request number'),
    state,
    baseRef: text(base['ref'], 'GitHub pull-request base ref', /^[A-Za-z0-9._/-]{1,255}$/),
    baseSha: text(base['sha'], 'GitHub pull-request base SHA', /^[a-f0-9]{40}$/),
    headSha: text(head['sha'], 'GitHub pull-request head SHA', /^[a-f0-9]{40}$/),
    mergeable: raw['mergeable'],
    linkedIssueNumbers,
    observedAt: args.observedAt,
  };
}
