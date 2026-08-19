import type { RepairConfidence, RepairInstruction, RepairRisk, RepairSkillId } from '../contracts';
import type { QaCommandPresetId } from './command-presets';

export type RepairRole = 'engineer' | 'reviewer' | 'qa' | 'merge-controller';

export type GitHubIssuerPolicy = {
  provider: 'github';
  appSlug: string;
  appId: number | null;
};

export type RepositoryProfile = {
  schemaVersion: 1;
  id: string;
  repository: string;
  defaultBranch: string;
  siteOrigin: string;
  allowedPathPrefixes: readonly string[];
  skillAllowlist: readonly RepairSkillId[];
  maxFiles: number;
  maxChangedLines: number;
  repositoryAdapter: {
    provider: 'github';
    installationMode: 'github_app';
    deploymentStrategy: 'merge_to_default_branch';
    deploymentProvider: 'cloudflare' | 'fixture';
    checkoutRoot: string | null;
    previewUrlTemplate: string | null;
    previewSmokePaths: readonly string[];
    productionSmokeUrls: readonly string[];
  };
  requiredChecks: readonly {
    checkName: string;
    appSlug: string;
    appId: number | null;
  }[];
  roleIssuers: {
    engineer: readonly GitHubIssuerPolicy[];
    reviewer: readonly GitHubIssuerPolicy[];
    qa: readonly GitHubIssuerPolicy[];
    'merge-controller': readonly GitHubIssuerPolicy[];
  };
  qaCommandPresetId: QaCommandPresetId;
};

export type AuditRepairHint = {
  instruction: RepairInstruction;
};

export type AuditFinding = {
  findingId: string;
  checkId: string;
  status: 'FAIL' | 'WARNING' | 'PASS' | 'BLOCKED' | 'NOT_EVALUATED' | 'LOW_CONFIDENCE';
  confidence: RepairConfidence;
  risk: RepairRisk;
  weight: number;
  category: string;
  finding: string;
  fix: string;
  repairHint?: AuditRepairHint;
};

export type AuditEnvelope = {
  schemaVersion: 1;
  producer: 'canonical-cloudflare-scheduler' | 'github-shadow-canary';
  auditRunId: string;
  repositoryProfileId: string;
  targetUrl: string;
  generatedAt: string;
  score: number | null;
  letterGrade: string | null;
  checkCatalogVersion: string;
  findings: readonly AuditFinding[];
};

export type RepairScope = {
  schemaVersion: 1;
  attempt: number;
  feedback: readonly string[];
  producer: AuditEnvelope['producer'];
  repairId: string;
  auditRunId: string;
  findingId: string;
  repositoryProfileId: string;
  repositoryProfileDigest: string;
  repository: string;
  defaultBranch: string;
  siteOrigin: string;
  sourceFinding: {
    checkId: string;
    targetUrl: string;
    finding: string;
    confidence: RepairConfidence;
    risk: RepairRisk;
    reportedAt: string;
  };
  instruction: RepairInstruction;
  changeBudget: { maxFiles: number; maxChangedLines: number };
  issue: {
    title: string;
    owner: 'engineer';
    reviewer: 'reviewer';
    retryPolicy: 'maximum_three_sha_bound_attempts';
    nextAction: string;
    dueAt: string;
    postcondition: string;
  };
};

export type EngineerArtifact = {
  schemaVersion: 1;
  contractMode: 'authenticated-github-v1';
  repairId: string;
  auditRunId: string;
  repositoryProfileId: string;
  repositoryProfileDigest: string;
  repository: string;
  risk: RepairRisk;
  attempt: number;
  baseSha: string;
  headSha: string;
  patchDigest: string;
  changedPaths: readonly string[];
  changedLines: number;
  authorIdentity: string;
  authorIssuer: GitHubIssuerPolicy;
  engineerEvidenceDigest: string;
};

export type GitHubRoleObservation = {
  provider: 'github';
  role: 'reviewer' | 'qa' | 'merge-controller';
  repository: string;
  appSlug: string;
  appId: number;
  checkRunId: number;
  headSha: string;
  conclusion: CheckConclusion;
  observedAt: string;
};

export type GitHubRequiredCheckObservation = {
  provider: 'github';
  repository: string;
  checkName: string;
  appSlug: string;
  appId: number;
  checkRunId: number;
  headSha: string;
  conclusion: CheckConclusion;
  observedAt: string;
};

export type RoleVerdict = {
  schemaVersion: 1;
  contractMode: 'authenticated-github-v1';
  role: 'reviewer' | 'qa';
  repairId: string;
  attempt: number;
  headSha: string;
  patchDigest: string;
  repositoryProfileDigest: string;
  engineerEvidenceDigest: string;
  workEvidenceDigest: string;
  identity: string;
  issuer: GitHubRoleObservation;
  verdict: 'passed' | 'failed';
  evidenceDigest: string;
  reasons: readonly string[];
};

export type CheckConclusion = 'success' | 'failure' | 'cancelled' | 'skipped' | 'pending';

export type PullRequestObservation = {
  repository: string;
  number: number;
  state: 'open' | 'closed';
  baseRef: string;
  baseSha: string;
  headSha: string;
  mergeable: boolean;
  lineageIssueNumbers: readonly number[];
  observedAt: string;
};

export type MergeGateInput = {
  enabled: boolean;
  killSwitch: boolean;
  risk: RepairRisk;
  artifact: EngineerArtifact;
  reviewer: RoleVerdict | null;
  qa: RoleVerdict | null;
  checkRuns: readonly GitHubRequiredCheckObservation[];
  profile: RepositoryProfile;
  profileDigest: string;
  mergeController: GitHubRoleObservation;
  pullRequest: PullRequestObservation;
  issueNumber: number;
  evaluatedAt: string;
  attemptsUsed: number;
};

export type MergeGateDecision =
  | { allowed: true; reasons: [] }
  | { allowed: false; reasons: string[] };

export type DeploymentObservation = {
  provider: 'cloudflare' | 'fixture';
  deploymentId: string;
  versionId: string;
  sourceSha: string;
  environment: 'preview' | 'production';
  observedAt: string;
};

export type DeploymentProbe = {
  url: string;
  status: number;
  finalUrl: string;
  bodyDigest: string;
};

export type DeploymentQaVerdict = {
  schemaVersion: 1;
  repositoryProfileId: string;
  repositoryProfileDigest: string;
  repairId: string;
  sourceSha: string;
  deploymentId: string;
  versionId: string;
  environment: 'preview' | 'production';
  verdict: 'passed' | 'failed';
  probeEvidenceDigest: string;
  evidenceDigest: string;
  reasons: readonly string[];
};
