import { parseRepairInstruction } from '../contracts';
import type { AuditEnvelope, AuditFinding, RepositoryProfile } from './contracts';
import { pathAllowed, validateRepositoryProfile } from './repository-profile';

export type AuditIntakeDecision =
  | { accepted: true; finding: AuditFinding; reasons: [] }
  | { accepted: false; finding: null; reasons: string[] };

const MAX_AUDIT_AGE_MS = 26 * 60 * 60 * 1000;

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error('value must be an object');
  return value as Record<string, unknown>;
}

function string(value: unknown, field: string, max: number): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > max) throw new Error(`${field} is invalid`);
  return value.trim();
}

export function parseAuditEnvelope(value: unknown): { ok: true; envelope: AuditEnvelope } | { ok: false; reason: string } {
  try {
    const raw = record(value);
    if (raw['schemaVersion'] !== 1) throw new Error('audit schemaVersion must be 1');
    const rawFindings = raw['findings'];
    if (!Array.isArray(rawFindings) || rawFindings.length > 20) throw new Error('audit findings must contain at most 20 items');
    const findings: AuditFinding[] = rawFindings.map((item, index) => {
      const finding = record(item);
      const status = finding['status'];
      if (!['FAIL', 'WARNING', 'PASS', 'BLOCKED', 'NOT_EVALUATED', 'LOW_CONFIDENCE'].includes(String(status))) throw new Error(`findings[${index}].status is invalid`);
      const confidence = finding['confidence'];
      if (!['high', 'medium', 'low'].includes(String(confidence))) throw new Error(`findings[${index}].confidence is invalid`);
      const risk = finding['risk'];
      if (!['low', 'medium', 'high', 'prohibited'].includes(String(risk))) throw new Error(`findings[${index}].risk is invalid`);
      const weight = finding['weight'];
      if (!Number.isFinite(weight) || Number(weight) < 0 || Number(weight) > 100) throw new Error(`findings[${index}].weight is invalid`);
      const repairHint = finding['repairHint'];
      return {
        findingId: string(finding['findingId'], `findings[${index}].findingId`, 160),
        checkId: string(finding['checkId'], `findings[${index}].checkId`, 120),
        status: status as AuditFinding['status'],
        confidence: confidence as AuditFinding['confidence'],
        risk: risk as AuditFinding['risk'],
        weight: Number(weight),
        category: string(finding['category'], `findings[${index}].category`, 120),
        finding: string(finding['finding'], `findings[${index}].finding`, 4_000),
        fix: string(finding['fix'], `findings[${index}].fix`, 4_000),
        ...(repairHint === undefined ? {} : { repairHint: { instruction: parseRepairInstruction(record(repairHint)['instruction']) } }),
      };
    });
    const targetUrl = string(raw['targetUrl'], 'targetUrl', 2_048);
    const parsedTarget = new URL(targetUrl);
    if (parsedTarget.protocol !== 'https:' || parsedTarget.username || parsedTarget.password) throw new Error('targetUrl must be credential-free https');
    const generatedAt = string(raw['generatedAt'], 'generatedAt', 64);
    const producer = raw['producer'];
    if (producer !== 'canonical-cloudflare-scheduler' && producer !== 'github-shadow-canary') throw new Error('audit producer is invalid');
    if (Number.isNaN(Date.parse(generatedAt))) throw new Error('generatedAt is invalid');
    const score = raw['score'];
    const letterGrade = raw['letterGrade'];
    const parsedScore = score === null ? null : Number(score);
    if (parsedScore !== null && (!Number.isFinite(parsedScore) || parsedScore < 0 || parsedScore > 100)) throw new Error('score is invalid');
    return {
      ok: true,
      envelope: {
        schemaVersion: 1,
        producer,
        auditRunId: string(raw['auditRunId'], 'auditRunId', 160),
        repositoryProfileId: string(raw['repositoryProfileId'], 'repositoryProfileId', 120),
        targetUrl: parsedTarget.toString(),
        generatedAt,
        score: parsedScore,
        letterGrade: letterGrade === null ? null : string(letterGrade, 'letterGrade', 16),
        checkCatalogVersion: string(raw['checkCatalogVersion'], 'checkCatalogVersion', 120),
        findings,
      },
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'invalid audit envelope' };
  }
}

export function selectAuditFinding(args: {
  envelope: AuditEnvelope;
  profile: RepositoryProfile;
  seenAuditRunIds: ReadonlySet<string>;
  nowMs: number;
}): AuditIntakeDecision {
  const { envelope, profile, seenAuditRunIds, nowMs } = args;
  const reasons = validateRepositoryProfile(profile);
  if (envelope.schemaVersion !== 1) reasons.push('audit schema is unsupported');
  if (envelope.repositoryProfileId !== profile.id) reasons.push('audit repository profile does not match');
  if (seenAuditRunIds.has(envelope.auditRunId)) reasons.push('audit run was already consumed');
  const generatedAt = Date.parse(envelope.generatedAt);
  if (!Number.isFinite(generatedAt) || generatedAt > nowMs + 5 * 60_000) reasons.push('audit timestamp is invalid');
  if (Number.isFinite(generatedAt) && nowMs - generatedAt > MAX_AUDIT_AGE_MS) reasons.push('audit is stale');
  try {
    if (new URL(envelope.targetUrl).origin !== new URL(profile.siteOrigin).origin) reasons.push('audit target origin does not match');
  } catch {
    reasons.push('audit target URL is invalid');
  }
  if (reasons.length > 0) return { accepted: false, finding: null, reasons: [...new Set(reasons)] };

  const ordered = [...envelope.findings].sort((left, right) => right.weight - left.weight);
  for (const finding of ordered) {
    const instruction = finding.repairHint?.instruction;
    if ((finding.status !== 'FAIL' && finding.status !== 'WARNING') || finding.confidence !== 'high' || finding.risk !== 'low') continue;
    if (!instruction || !profile.skillAllowlist.includes(instruction.skillId)) continue;
    if (!pathAllowed(profile, instruction.path)) continue;
    return { accepted: true, finding, reasons: [] };
  }
  return { accepted: false, finding: null, reasons: ['no eligible supported finding'] };
}
