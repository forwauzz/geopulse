export const REPAIR_SKILL_IDS = [
  'ensure-robots-sitemap',
  'remove-sitemap-url',
  'replace-broken-internal-link',
] as const;

export type RepairSkillId = (typeof REPAIR_SKILL_IDS)[number];
export type RepairConfidence = 'high' | 'medium' | 'low';
export type RepairRisk = 'low' | 'medium' | 'high' | 'prohibited';

export type EnsureRobotsSitemapInstruction = {
  skillId: 'ensure-robots-sitemap';
  path: 'public/robots.txt';
  sitemapUrl: string;
};

export type RemoveSitemapUrlInstruction = {
  skillId: 'remove-sitemap-url';
  path: string;
  url: string;
};

export type ReplaceBrokenInternalLinkInstruction = {
  skillId: 'replace-broken-internal-link';
  path: string;
  from: string;
  to: string;
};

export type RepairInstruction =
  | EnsureRobotsSitemapInstruction
  | RemoveSitemapUrlInstruction
  | ReplaceBrokenInternalLinkInstruction;

export type ChangeBudget = {
  maxFiles: number;
  maxChangedLines: number;
};

export type RepairFinding = {
  findingId: string;
  sourceAuditId: string;
  checkId: string;
  targetUrl: string;
  finding: string;
  confidence: RepairConfidence;
  risk: RepairRisk;
  reportedAt: string;
};

export type RepairFixture = {
  files: Record<string, string>;
};

export type RepairRequest = {
  schemaVersion: 1;
  mode: 'shadow';
  repository: string;
  siteOrigin: string;
  idempotencyKey: string;
  finding: RepairFinding;
  instruction: RepairInstruction;
  changeBudget: ChangeBudget;
  fixture: RepairFixture;
};

export type ParseResult =
  | { ok: true; request: RepairRequest }
  | { ok: false; reason: string };

export type ChangedFileEvidence = {
  path: string;
  beforeSha256: string | null;
  afterSha256: string;
  changedLines: number;
};

export type RunnerResult = {
  schemaVersion: 1;
  jobId: string;
  skillId: RepairSkillId;
  ok: boolean;
  changed: boolean;
  changedFiles: ChangedFileEvidence[];
  finalFiles: Record<string, string>;
  postcondition: {
    passed: boolean;
    evidence: string;
  };
  failureReason: string | null;
};

export type EvaluationResult = {
  passed: boolean;
  hardGateFailures: string[];
  evidenceDigest: string;
  score: number;
};

export type RunnerParseResult =
  | { ok: true; result: RunnerResult }
  | { ok: false; reason: string };

const MAX_BODY_STRINGS = {
  id: 160,
  checkId: 120,
  url: 2_048,
  finding: 4_000,
  path: 240,
  replacement: 8_000,
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function boundedString(value: unknown, field: string, maxLength: number): string {
  if (typeof value !== 'string') throw new Error(`${field} must be a string`);
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    throw new Error(`${field} must contain 1-${maxLength} characters`);
  }
  return trimmed;
}

function exactInteger(value: unknown, field: string, min: number, max: number): number {
  if (!Number.isInteger(value) || (value as number) < min || (value as number) > max) {
    throw new Error(`${field} must be an integer between ${min} and ${max}`);
  }
  return value as number;
}

function parseUrl(value: unknown, field: string): string {
  const raw = boundedString(value, field, MAX_BODY_STRINGS.url);
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${field} must be an absolute URL`);
  }
  if (parsed.protocol !== 'https:') throw new Error(`${field} must use https`);
  if (parsed.username || parsed.password) throw new Error(`${field} must not contain credentials`);
  return parsed.toString();
}

function parseFinding(value: unknown): RepairFinding {
  if (!isRecord(value)) throw new Error('finding must be an object');
  const confidence = value['confidence'];
  if (confidence !== 'high' && confidence !== 'medium' && confidence !== 'low') {
    throw new Error('finding.confidence is invalid');
  }
  const risk = value['risk'];
  if (risk !== 'low' && risk !== 'medium' && risk !== 'high' && risk !== 'prohibited') {
    throw new Error('finding.risk is invalid');
  }
  const reportedAt = boundedString(value['reportedAt'], 'finding.reportedAt', 64);
  if (Number.isNaN(Date.parse(reportedAt))) throw new Error('finding.reportedAt must be ISO-compatible');
  return {
    findingId: boundedString(value['findingId'], 'finding.findingId', MAX_BODY_STRINGS.id),
    sourceAuditId: boundedString(value['sourceAuditId'], 'finding.sourceAuditId', MAX_BODY_STRINGS.id),
    checkId: boundedString(value['checkId'], 'finding.checkId', MAX_BODY_STRINGS.checkId),
    targetUrl: parseUrl(value['targetUrl'], 'finding.targetUrl'),
    finding: boundedString(value['finding'], 'finding.finding', MAX_BODY_STRINGS.finding),
    confidence,
    risk,
    reportedAt,
  };
}

function parseInstruction(value: unknown): RepairInstruction {
  if (!isRecord(value)) throw new Error('instruction must be an object');
  const skillId = value['skillId'];
  const path = boundedString(value['path'], 'instruction.path', MAX_BODY_STRINGS.path);
  if (skillId === 'ensure-robots-sitemap') {
    if (path !== 'public/robots.txt') {
      throw new Error('ensure-robots-sitemap may only write public/robots.txt');
    }
    return { skillId, path, sitemapUrl: parseUrl(value['sitemapUrl'], 'instruction.sitemapUrl') };
  }
  if (skillId === 'remove-sitemap-url') {
    return { skillId, path, url: parseUrl(value['url'], 'instruction.url') };
  }
  if (skillId === 'replace-broken-internal-link') {
    return {
      skillId,
      path,
      from: boundedString(value['from'], 'instruction.from', MAX_BODY_STRINGS.replacement),
      to: boundedString(value['to'], 'instruction.to', MAX_BODY_STRINGS.replacement),
    };
  }
  throw new Error('instruction.skillId is not supported');
}

function parseFixture(value: unknown): RepairFixture {
  if (!isRecord(value) || !isRecord(value['files'])) throw new Error('fixture.files must be an object');
  const entries = Object.entries(value['files']);
  if (entries.length === 0 || entries.length > 10) throw new Error('fixture must contain 1-10 files');
  let totalBytes = 0;
  const files: Record<string, string> = {};
  for (const [path, content] of entries) {
    if (path.length === 0 || path.length > MAX_BODY_STRINGS.path || typeof content !== 'string') {
      throw new Error('fixture contains an invalid path or non-string content');
    }
    totalBytes += new TextEncoder().encode(content).byteLength;
    files[path] = content;
  }
  if (totalBytes > 128_000) throw new Error('fixture exceeds the 128KB shadow limit');
  return { files };
}

export function parseRepairRequest(value: unknown): ParseResult {
  try {
    if (!isRecord(value)) throw new Error('request must be an object');
    if (value['schemaVersion'] !== 1) throw new Error('schemaVersion must be 1');
    if (value['mode'] !== 'shadow') throw new Error('only shadow mode is supported');
    if (!isRecord(value['changeBudget'])) throw new Error('changeBudget must be an object');

    return {
      ok: true,
      request: {
        schemaVersion: 1,
        mode: 'shadow',
        repository: boundedString(value['repository'], 'repository', 200),
        siteOrigin: new URL(parseUrl(value['siteOrigin'], 'siteOrigin')).origin,
        idempotencyKey: boundedString(value['idempotencyKey'], 'idempotencyKey', MAX_BODY_STRINGS.id),
        finding: parseFinding(value['finding']),
        instruction: parseInstruction(value['instruction']),
        changeBudget: {
          maxFiles: exactInteger(value['changeBudget']['maxFiles'], 'changeBudget.maxFiles', 1, 3),
          maxChangedLines: exactInteger(
            value['changeBudget']['maxChangedLines'],
            'changeBudget.maxChangedLines',
            1,
            100
          ),
        },
        fixture: parseFixture(value['fixture']),
      },
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'invalid repair request' };
  }
}

export function parseRunnerResult(value: unknown): RunnerParseResult {
  try {
    if (!isRecord(value)) throw new Error('runner result must be an object');
    if (value['schemaVersion'] !== 1) throw new Error('runner result schemaVersion must be 1');
    const skillId = value['skillId'];
    if (
      skillId !== 'ensure-robots-sitemap' &&
      skillId !== 'remove-sitemap-url' &&
      skillId !== 'replace-broken-internal-link'
    ) {
      throw new Error('runner result skillId is invalid');
    }
    if (!Array.isArray(value['changedFiles'])) throw new Error('runner changedFiles must be an array');
    if (!isRecord(value['finalFiles'])) throw new Error('runner finalFiles must be an object');
    if (!isRecord(value['postcondition'])) throw new Error('runner postcondition must be an object');

    const changedFiles: ChangedFileEvidence[] = value['changedFiles'].map((raw, index) => {
      if (!isRecord(raw)) throw new Error(`runner changedFiles[${index}] must be an object`);
      const beforeSha256 = raw['beforeSha256'];
      if (beforeSha256 !== null && typeof beforeSha256 !== 'string') {
        throw new Error(`runner changedFiles[${index}].beforeSha256 is invalid`);
      }
      return {
        path: boundedString(raw['path'], `runner changedFiles[${index}].path`, MAX_BODY_STRINGS.path),
        beforeSha256,
        afterSha256: boundedString(raw['afterSha256'], `runner changedFiles[${index}].afterSha256`, 64),
        changedLines: exactInteger(raw['changedLines'], `runner changedFiles[${index}].changedLines`, 0, 10_000),
      };
    });

    const finalFiles: Record<string, string> = {};
    let finalBytes = 0;
    for (const [path, content] of Object.entries(value['finalFiles'])) {
      if (typeof content !== 'string') throw new Error(`runner finalFiles.${path} must be a string`);
      finalBytes += new TextEncoder().encode(content).byteLength;
      finalFiles[path] = content;
    }
    if (finalBytes > 160_000) throw new Error('runner finalFiles evidence exceeds 160KB');

    const failureReason = value['failureReason'];
    if (failureReason !== null && typeof failureReason !== 'string') {
      throw new Error('runner failureReason is invalid');
    }
    if (typeof value['ok'] !== 'boolean' || typeof value['changed'] !== 'boolean') {
      throw new Error('runner result booleans are invalid');
    }
    if (typeof value['postcondition']['passed'] !== 'boolean') {
      throw new Error('runner postcondition.passed is invalid');
    }
    return {
      ok: true,
      result: {
        schemaVersion: 1,
        jobId: boundedString(value['jobId'], 'runner jobId', MAX_BODY_STRINGS.id),
        skillId,
        ok: value['ok'],
        changed: value['changed'],
        changedFiles,
        finalFiles,
        postcondition: {
          passed: value['postcondition']['passed'],
          evidence: boundedString(value['postcondition']['evidence'], 'runner postcondition.evidence', 2_000),
        },
        failureReason,
      },
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'invalid runner result' };
  }
}
