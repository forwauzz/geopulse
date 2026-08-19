import type { RepairConfidence, RepairInstruction, RepairRisk, RepairSkillId } from '../contracts';

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
    checkoutRoot: string | null;
    previewUrlTemplate: string | null;
    productionSmokeUrls: readonly string[];
  };
  requiredChecks: readonly {
    workflow: string;
    job: string;
    appSlug: string;
  }[];
  qaCommands: {
    focused: readonly string[];
    affected: readonly string[];
    typeCheck: readonly string[];
    build: readonly string[];
    browser: readonly string[];
  };
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
  repairId: string;
  auditRunId: string;
  repositoryProfileId: string;
  repository: string;
  risk: RepairRisk;
  attempt: number;
  baseSha: string;
  headSha: string;
  patchDigest: string;
  changedPaths: readonly string[];
  changedLines: number;
  authorIdentity: string;
};

export type RoleVerdict = {
  schemaVersion: 1;
  role: 'reviewer' | 'qa';
  repairId: string;
  attempt: number;
  headSha: string;
  patchDigest: string;
  identity: string;
  verdict: 'passed' | 'failed';
  evidenceDigest: string;
  reasons: readonly string[];
};

export type CheckConclusion = 'success' | 'failure' | 'cancelled' | 'skipped' | 'pending';

export type MergeGateInput = {
  enabled: boolean;
  killSwitch: boolean;
  risk: RepairRisk;
  artifact: EngineerArtifact;
  reviewer: RoleVerdict | null;
  qa: RoleVerdict | null;
  checks: Readonly<Record<string, CheckConclusion>>;
  profile: RepositoryProfile;
  attemptsUsed: number;
};

export type MergeGateDecision =
  | { allowed: true; reasons: [] }
  | { allowed: false; reasons: string[] };
