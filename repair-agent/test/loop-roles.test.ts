import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseAuditEnvelope, selectAuditFinding } from '../src/loop/audit-intake';
import type { AuditEnvelope, EngineerArtifact, RepositoryProfile, RoleVerdict } from '../src/loop/contracts';
import { evaluateMergeGate, feedbackForNextAttempt } from '../src/loop/merge-gate';
import {
  GEOPULSE_CANARY_PROFILE,
  GEOPULSE_PROFILE,
  PORTABLE_FIXTURE_PROFILE,
  validateRepositoryProfile,
} from '../src/loop/repository-profile';
import { scopeRepair } from '../src/loop/scoper';
import { qaEngineerArtifact, reviewEngineerArtifact } from '../src/loop/verdicts';
import { admitRepair } from '../src/policy';

const nowMs = Date.parse('2026-08-19T16:00:00.000Z');

function audit(overrides: Partial<AuditEnvelope> = {}): AuditEnvelope {
  return {
    schemaVersion: 1,
    producer: 'github-shadow-canary',
    auditRunId: 'audit-run-1',
    repositoryProfileId: GEOPULSE_PROFILE.id,
    targetUrl: 'https://getgeopulse.com/resources',
    generatedAt: '2026-08-19T15:55:00.000Z',
    score: 82,
    letterGrade: 'B',
    checkCatalogVersion: '2026-08-19',
    findings: [
      {
        findingId: 'finding-1',
        checkId: 'broken-internal-link',
        status: 'FAIL',
        confidence: 'high',
        risk: 'low',
        weight: 10,
        category: 'technical',
        finding: 'An exact internal link points to a removed page.',
        fix: 'Replace it with the verified successor URL.',
        repairHint: {
          instruction: {
            skillId: 'replace-broken-internal-link',
            path: 'app/resources/page.tsx',
            from: '/articles/old-guide',
            to: '/articles/new-guide',
          },
        },
      },
    ],
    ...overrides,
  };
}

function artifact(overrides: Partial<EngineerArtifact> = {}): EngineerArtifact {
  return {
    schemaVersion: 1,
    repairId: 'repair-1',
    auditRunId: 'audit-run-1',
    repositoryProfileId: 'geopulse-v1',
    repository: 'forwauzz/geopulse',
    risk: 'low',
    attempt: 1,
    baseSha: 'a'.repeat(40),
    headSha: 'b'.repeat(40),
    patchDigest: 'c'.repeat(64),
    changedPaths: ['app/resources/page.tsx'],
    changedLines: 2,
    authorIdentity: 'repair-engineer',
    ...overrides,
  };
}

function verdict(role: 'reviewer' | 'qa', overrides: Partial<RoleVerdict> = {}): RoleVerdict {
  return {
    schemaVersion: 1,
    role,
    repairId: 'repair-1',
    attempt: 1,
    headSha: 'b'.repeat(40),
    patchDigest: 'c'.repeat(64),
    identity: role === 'reviewer' ? 'repair-reviewer' : 'repair-qa',
    verdict: 'passed',
    evidenceDigest: 'd'.repeat(64),
    reasons: [],
    ...overrides,
  };
}

describe('repository profile role', () => {
  it('validates both GEO-Pulse and a second portable repository profile', () => {
    expect(validateRepositoryProfile(GEOPULSE_PROFILE)).toEqual([]);
    expect(validateRepositoryProfile(GEOPULSE_CANARY_PROFILE)).toEqual([]);
    expect(validateRepositoryProfile(PORTABLE_FIXTURE_PROFILE)).toEqual([]);
    const portableFile = JSON.parse(readFileSync(new URL('./portable-repo/.repair-agent/repository-profile.v1.json', import.meta.url), 'utf8')) as RepositoryProfile;
    expect(portableFile).toEqual(PORTABLE_FIXTURE_PROFILE);
    expect(validateRepositoryProfile(portableFile)).toEqual([]);
  });

  it('rejects unsafe paths and deployment commands', () => {
    expect(validateRepositoryProfile({
      ...PORTABLE_FIXTURE_PROFILE,
      allowedPathPrefixes: ['../secrets'],
      qaCommands: { ...PORTABLE_FIXTURE_PROFILE.qaCommands, build: ['npm run deploy'] },
    })).toEqual(expect.arrayContaining([
      'unsafe allowed path prefix: ../secrets',
      'unsafe QA command: npm run deploy',
    ]));
  });

  it('rejects ambiguous checks, unsafe default branches, and credential-bearing smoke URLs', () => {
    const failures = validateRepositoryProfile({
      ...PORTABLE_FIXTURE_PROFILE,
      defaultBranch: '../main',
      requiredChecks: [{ workflow: 'CI', job: 'verify', appSlug: 'bad/app' }],
      repositoryAdapter: {
        ...PORTABLE_FIXTURE_PROFILE.repositoryAdapter,
        productionSmokeUrls: ['https://user:password@portable.example/'],
      },
    });
    expect(failures).toEqual(expect.arrayContaining([
      'default branch is invalid',
      'required check identity is invalid',
      'production smoke URL is invalid',
    ]));
  });

  it('rejects dot-segment, backslash, absolute, drive, and UNC traversal vectors', async () => {
    for (const path of ['app/../.github/workflows/x.yml', 'app\\page.tsx', '/app/page.tsx', 'C:/app/page.tsx', '//server/share']) {
      const envelope = audit({ findings: [{ ...audit().findings[0]!, repairHint: { instruction: { skillId: 'replace-broken-internal-link', path, from: '/old', to: '/new' } } }] });
      expect(selectAuditFinding({ envelope, profile: GEOPULSE_PROFILE, seenAuditRunIds: new Set(), nowMs })).toMatchObject({ accepted: false });
    }
  });
});

describe('audit intake agent', () => {
  it('parses a bounded audit envelope and intake rejects unsafe repair paths', () => {
    expect(parseAuditEnvelope(audit()).ok).toBe(true);
    const unsafe = audit({ findings: [{ ...audit().findings[0]!, repairHint: { instruction: { skillId: 'replace-broken-internal-link', path: '../.env', from: '/old', to: '/new' } } }] });
    expect(parseAuditEnvelope(unsafe).ok).toBe(true);
    expect(selectAuditFinding({ envelope: unsafe, profile: GEOPULSE_PROFILE, seenAuditRunIds: new Set(), nowMs })).toMatchObject({ accepted: false, reasons: ['no eligible supported finding'] });
  });

  it('selects at most one fresh, high-confidence, low-risk supported finding', () => {
    const result = selectAuditFinding({ envelope: audit(), profile: GEOPULSE_PROFILE, seenAuditRunIds: new Set(), nowMs });
    expect(result.accepted).toBe(true);
    if (result.accepted) expect(result.finding.findingId).toBe('finding-1');
  });

  it('fails closed for replay, stale audit, and unsupported findings', () => {
    expect(selectAuditFinding({ envelope: audit(), profile: GEOPULSE_PROFILE, seenAuditRunIds: new Set(['audit-run-1']), nowMs })).toMatchObject({ accepted: false, reasons: ['audit run was already consumed'] });
    expect(selectAuditFinding({ envelope: audit({ generatedAt: '2026-08-17T00:00:00.000Z' }), profile: GEOPULSE_PROFILE, seenAuditRunIds: new Set(), nowMs })).toMatchObject({ accepted: false, reasons: ['audit is stale'] });
    expect(selectAuditFinding({ envelope: audit({ findings: [{ ...audit().findings[0]!, repairHint: undefined }] }), profile: GEOPULSE_PROFILE, seenAuditRunIds: new Set(), nowMs })).toMatchObject({ accepted: false, reasons: ['no eligible supported finding'] });
  });
});

describe('scoper agent', () => {
  it('creates a deterministic bounded issue and retry contract', async () => {
    const envelope = audit();
    const finding = envelope.findings[0]!;
    const first = await scopeRepair({ envelope, finding, profile: GEOPULSE_PROFILE, nowMs });
    const second = await scopeRepair({ envelope, finding, profile: GEOPULSE_PROFILE, nowMs });
    expect(first.repairId).toBe(second.repairId);
    expect(first).toMatchObject({
      repository: 'forwauzz/geopulse',
      changeBudget: { maxFiles: 1, maxChangedLines: 4 },
      issue: { owner: 'engineer', reviewer: 'reviewer', retryPolicy: 'maximum_three_sha_bound_attempts' },
    });
    const admission = admitRepair({
      schemaVersion: 1,
      mode: 'shadow',
      repository: first.repository,
      siteOrigin: first.siteOrigin,
      idempotencyKey: first.repairId,
      attempt: first.attempt,
      feedback: first.feedback,
      finding: {
        findingId: first.findingId,
        sourceAuditId: first.auditRunId,
        checkId: finding.checkId,
        targetUrl: envelope.targetUrl,
        finding: finding.finding,
        confidence: finding.confidence,
        risk: finding.risk,
        reportedAt: envelope.generatedAt,
      },
      instruction: first.instruction,
      changeBudget: first.changeBudget,
      fixture: { files: { 'app/resources/page.tsx': '<a href="/articles/old-guide">Guide</a>\n' } },
    }, {
      mode: 'shadow', killSwitch: false, productionMutationsEnabled: false,
      repositoryAllowlist: ['forwauzz/geopulse'], originAllowlist: ['https://getgeopulse.com'], maxAttempts: 3,
    });
    expect(admission).toMatchObject({ admitted: true });
  });
});

describe('review agent', () => {
  it('passes a bounded current-SHA artifact and rejects tampering or self-review', async () => {
    const good = await reviewEngineerArtifact({ artifact: artifact(), profile: GEOPULSE_PROFILE, reviewerIdentity: 'repair-reviewer', observedHeadSha: 'b'.repeat(40), observedPatchDigest: 'c'.repeat(64) });
    expect(good.verdict).toBe('passed');

    const bad = await reviewEngineerArtifact({ artifact: artifact(), profile: GEOPULSE_PROFILE, reviewerIdentity: 'repair-engineer', observedHeadSha: 'e'.repeat(40), observedPatchDigest: 'f'.repeat(64) });
    expect(bad).toMatchObject({ verdict: 'failed' });
    expect(bad.reasons).toEqual(expect.arrayContaining(['review head SHA is stale', 'review patch digest does not match', 'reviewer must be independent from engineer']));
  });
});

describe('QA agent', () => {
  it('binds evidence to the current SHA and returns actionable engineer feedback', async () => {
    const qa = await qaEngineerArtifact({ artifact: artifact(), qaIdentity: 'repair-qa', observedHeadSha: 'b'.repeat(40), observedPatchDigest: 'c'.repeat(64), commandResults: [{ command: 'npm run test', exitCode: 1 }], postconditionPassed: false });
    expect(qa.verdict).toBe('failed');
    const feedback = feedbackForNextAttempt({ artifact: artifact(), reviewer: verdict('reviewer'), qa });
    expect(feedback).toEqual({ retry: true, nextAttempt: 2, feedback: ['QA command failed: npm run test', 'finding-specific postcondition failed'] });
  });

  it('stops after the third failed attempt', () => {
    const feedback = feedbackForNextAttempt({ artifact: artifact({ attempt: 3 }), reviewer: verdict('reviewer', { attempt: 3 }), qa: verdict('qa', { attempt: 3, verdict: 'failed', reasons: ['browser regression'] }) });
    expect(feedback).toEqual({ retry: false, nextAttempt: null, feedback: ['browser regression'] });
  });
});

describe('deterministic merge controller', () => {
  it('allows only a low-risk exact-SHA repair with distinct green review, QA, and CI', () => {
    expect(evaluateMergeGate({
      enabled: true,
      killSwitch: false,
      risk: 'low',
      artifact: artifact(),
      reviewer: verdict('reviewer'),
      qa: verdict('qa'),
      checks: {
        'github-actions:CI/verify': 'success',
        'geo-pulse-repair-reviewer:Repair Review/repair-review': 'success',
        'geo-pulse-repair-qa:Repair QA/repair-qa': 'success',
      },
      profile: GEOPULSE_PROFILE,
      attemptsUsed: 1,
    })).toEqual({ allowed: true, reasons: [] });
  });

  it('maps the canary checkout root into the formal repository path policy', () => {
    const canaryArtifact = artifact({
      repositoryProfileId: GEOPULSE_CANARY_PROFILE.id,
      changedPaths: ['repair-agent/test/portable-repo/public/robots.txt'],
    });
    expect(evaluateMergeGate({
      enabled: true,
      killSwitch: false,
      risk: 'low',
      artifact: canaryArtifact,
      reviewer: verdict('reviewer'),
      qa: verdict('qa'),
      checks: {
        'github-actions:CI/verify': 'success',
        'geo-pulse-repair-reviewer:Repair Review/repair-review': 'success',
        'geo-pulse-repair-qa:Repair QA/repair-qa': 'success',
      },
      profile: GEOPULSE_CANARY_PROFILE,
      attemptsUsed: 1,
    })).toEqual({ allowed: true, reasons: [] });
    const unprefixed = evaluateMergeGate({
      enabled: true, killSwitch: false, risk: 'low',
      artifact: { ...canaryArtifact, changedPaths: ['public/robots.txt'] },
      reviewer: verdict('reviewer'), qa: verdict('qa'),
      checks: {
        'github-actions:CI/verify': 'success',
        'geo-pulse-repair-reviewer:Repair Review/repair-review': 'success',
        'geo-pulse-repair-qa:Repair QA/repair-qa': 'success',
      },
      profile: GEOPULSE_CANARY_PROFILE, attemptsUsed: 1,
    });
    expect(unprefixed).toMatchObject({ allowed: false, reasons: expect.arrayContaining(['engineer artifact contains a disallowed path']) });
  });

  it('fails closed on disabled mode, stale review, shared identity, or red checks', () => {
    const decision = evaluateMergeGate({
      enabled: false,
      killSwitch: false,
      risk: 'low',
      artifact: artifact(),
      reviewer: verdict('reviewer', { headSha: 'e'.repeat(40), identity: 'same-gate-agent' }),
      qa: verdict('qa', { identity: 'same-gate-agent' }),
      checks: {
        'github-actions:CI/verify': 'failure',
        'geo-pulse-repair-reviewer:Repair Review/repair-review': 'success',
        'geo-pulse-repair-qa:Repair QA/repair-qa': 'success',
      },
      profile: GEOPULSE_PROFILE,
      attemptsUsed: 1,
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reasons).toEqual(expect.arrayContaining([
      'autonomous merge is not enabled',
      'reviewer verdict is stale for the current head SHA',
      'reviewer and QA identities must be distinct',
      'required check is not green: github-actions:CI/verify',
    ]));
  });
});
