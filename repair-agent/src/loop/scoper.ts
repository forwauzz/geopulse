import type { AuditEnvelope, AuditFinding, RepairScope, RepositoryProfile } from './contracts';
import { getRepairSkill } from '../skills';
import { pathAllowed } from './repository-profile';
import { repositoryProfileDigest } from './profile-registry';

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
}

export async function scopeRepair(args: {
  envelope: AuditEnvelope;
  finding: AuditFinding;
  profile: RepositoryProfile;
  profileDigest: string;
  nowMs: number;
}): Promise<RepairScope> {
  const instruction = args.finding.repairHint?.instruction;
  if (!instruction) throw new Error('eligible finding is missing a repair instruction');
  const skill = getRepairSkill(instruction.skillId);
  if (!skill.allowedCheckIds.includes(args.finding.checkId)) throw new Error('finding check is incompatible with the selected repair skill');
  if (!skill.pathPattern.test(instruction.path) || !pathAllowed(args.profile, instruction.path)) throw new Error('repair instruction path is not allowed');
  if (!/^[a-f0-9]{64}$/.test(args.profileDigest) || await repositoryProfileDigest(args.profile) !== args.profileDigest) throw new Error('repository profile digest is invalid');
  // A lineage identifies the defect and desired change, not the audit run that
  // happened to observe it. Repeated scheduler/admin/CI observations converge.
  const identity = [
    args.profile.id,
    args.profileDigest,
    args.profile.repository,
    new URL(args.envelope.targetUrl).toString(),
    args.finding.checkId,
    JSON.stringify(instruction),
  ].join(':');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity));
  const repairId = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('').slice(0, 32);
  return {
    schemaVersion: 1,
    attempt: 1,
    feedback: [],
    producer: args.envelope.producer,
    repairId,
    auditRunId: args.envelope.auditRunId,
    findingId: args.finding.findingId,
    repositoryProfileId: args.profile.id,
    repositoryProfileDigest: args.profileDigest,
    repository: args.profile.repository,
    defaultBranch: args.profile.defaultBranch,
    siteOrigin: new URL(args.profile.siteOrigin).origin,
    sourceFinding: {
      checkId: args.finding.checkId,
      targetUrl: args.envelope.targetUrl,
      finding: args.finding.finding,
      confidence: args.finding.confidence,
      risk: args.finding.risk,
      reportedAt: args.envelope.generatedAt,
    },
    instruction,
    changeBudget: {
      maxFiles: Math.min(args.profile.maxFiles, skill.maximumFiles),
      maxChangedLines: Math.min(args.profile.maxChangedLines, skill.maximumChangedLines),
    },
    issue: {
      title: `[REPAIR] ${slug(args.finding.checkId)} on ${new URL(args.envelope.targetUrl).hostname}`,
      owner: 'engineer',
      reviewer: 'reviewer',
      retryPolicy: 'maximum_three_sha_bound_attempts',
      nextAction: `Apply ${instruction.skillId} to ${instruction.path} in an isolated branch.`,
      dueAt: new Date(args.nowMs + 4 * 60 * 60 * 1000).toISOString(),
      postcondition: `The ${instruction.skillId} postcondition passes and the audit finding is no longer reproducible.`,
    },
  };
}
