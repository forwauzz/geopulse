import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseAuditEnvelope, selectAuditFinding } from '../src/loop/audit-intake';
import type { AuditEnvelope, EngineerArtifact, GitHubRoleObservation, MergeGateInput, RepositoryProfile } from '../src/loop/contracts';
import { evaluateDeploymentQa } from '../src/loop/deployment-qa';
import { DeploymentEvidenceAdapter } from '../src/loop/deployment-adapter';
import { GitHubObservationAdapter } from '../src/loop/github-adapter';
import { parseGitHubCheckRunObservation, parseGitHubPullRequestObservation, parseGitHubRequiredCheckObservation, parseRepairIssueLineageMarkers } from '../src/loop/github-observations';
import { evaluateMergeGate, feedbackForNextAttempt } from '../src/loop/merge-gate';
import { RepositoryProfileRegistry, repositoryProfileDigest } from '../src/loop/profile-registry';
import {
  artifactPathAllowed,
  GEOPULSE_CANARY_PROFILE,
  GEOPULSE_PROFILE,
  PORTABLE_FIXTURE_PROFILE,
  profileSupportsAutonomousMerge,
  validateRepositoryProfile,
} from '../src/loop/repository-profile';
import { scopeRepair } from '../src/loop/scoper';
import { qaEngineerArtifact, reviewEngineerArtifact } from '../src/loop/verdicts';
import { admitRepair } from '../src/policy';

const now = '2026-08-19T16:00:00.000Z';
const nowMs = Date.parse(now);
let geoDigest = '';
let canaryDigest = '';
let portableDigest = '';

beforeAll(async () => {
  [geoDigest, canaryDigest, portableDigest] = await Promise.all([
    repositoryProfileDigest(GEOPULSE_PROFILE),
    repositoryProfileDigest(GEOPULSE_CANARY_PROFILE),
    repositoryProfileDigest(PORTABLE_FIXTURE_PROFILE),
  ]);
});

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
    findings: [{
      findingId: 'finding-1', checkId: 'broken-internal-link', status: 'FAIL', confidence: 'high', risk: 'low', weight: 10,
      category: 'technical', finding: 'An exact internal link points to a removed page.', fix: 'Replace it with the verified successor URL.',
      repairHint: { instruction: { skillId: 'replace-broken-internal-link', path: 'app/resources/page.tsx', from: '/articles/old-guide', to: '/articles/new-guide' } },
    }],
    ...overrides,
  };
}

function artifact(overrides: Partial<EngineerArtifact> = {}): EngineerArtifact {
  return {
    schemaVersion: 1,
    contractMode: 'authenticated-github-v1',
    repairId: 'repair-1',
    auditRunId: 'audit-run-1',
    repositoryProfileId: PORTABLE_FIXTURE_PROFILE.id,
    repositoryProfileDigest: portableDigest,
    repository: PORTABLE_FIXTURE_PROFILE.repository,
    risk: 'low',
    attempt: 1,
    baseSha: 'a'.repeat(40),
    headSha: 'b'.repeat(40),
    patchDigest: 'c'.repeat(64),
    changedPaths: ['public/robots.txt'],
    changedLines: 2,
    authorIdentity: 'github-app:91000:portable-repair-engineer:check-run:100',
    authorIssuer: { provider: 'github', appSlug: 'portable-repair-engineer', appId: 91000 },
    engineerEvidenceDigest: 'e'.repeat(64),
    ...overrides,
  };
}

function observation(role: 'reviewer' | 'qa' | 'merge-controller', overrides: Partial<GitHubRoleObservation> = {}): GitHubRoleObservation {
  const roleConfig = role === 'reviewer'
    ? { appSlug: 'portable-repair-reviewer', appId: 91001, checkRunId: 101 }
    : role === 'qa'
      ? { appSlug: 'portable-repair-qa', appId: 91002, checkRunId: 102 }
      : { appSlug: 'portable-repair-merge', appId: 91003, checkRunId: 103 };
  const base = parseGitHubCheckRunObservation({
    raw: {
      id: roleConfig.checkRunId,
      head_sha: 'b'.repeat(40),
      conclusion: 'success',
      app: { slug: roleConfig.appSlug, id: roleConfig.appId },
    },
    role,
    repository: PORTABLE_FIXTURE_PROFILE.repository,
    observedAt: '2026-08-19T15:59:00.000Z',
  });
  return { ...base, ...overrides };
}

async function mergeInput(overrides: Partial<MergeGateInput> = {}): Promise<MergeGateInput> {
  const engineer = artifact();
  const reviewer = await reviewEngineerArtifact({
    artifact: engineer, profile: PORTABLE_FIXTURE_PROFILE, profileDigest: portableDigest,
    observation: observation('reviewer'), observedPatchDigest: engineer.patchDigest,
  });
  const qa = await qaEngineerArtifact({
    artifact: engineer, profile: PORTABLE_FIXTURE_PROFILE, profileDigest: portableDigest,
    observation: observation('qa'), observedPatchDigest: engineer.patchDigest,
    commandResults: [{ argv: ['node', '--test'], exitCode: 0 }], postconditionPassed: true,
  });
  return {
    enabled: true,
    killSwitch: false,
    risk: 'low',
    artifact: engineer,
    reviewer,
    qa,
    checkRuns: PORTABLE_FIXTURE_PROFILE.requiredChecks.map((check, index) => parseGitHubRequiredCheckObservation({
      raw: { id: check.checkName === 'repair-review' ? 101 : check.checkName === 'repair-qa' ? 102 : 200 + index, name: check.checkName, head_sha: engineer.headSha, conclusion: 'success', app: { slug: check.appSlug, id: check.appId } },
      repository: PORTABLE_FIXTURE_PROFILE.repository, observedAt: '2026-08-19T15:59:00.000Z',
    })),
    profile: PORTABLE_FIXTURE_PROFILE,
    profileDigest: portableDigest,
    mergeController: observation('merge-controller'),
    pullRequest: parseGitHubPullRequestObservation({
      raw: { number: 8, state: 'open', mergeable: true, base: { ref: 'main', sha: engineer.baseSha }, head: { sha: engineer.headSha } },
      repository: PORTABLE_FIXTURE_PROFILE.repository, lineageIssueNumbers: [7], observedAt: '2026-08-19T15:59:30.000Z',
    }),
    issueNumber: 7,
    evaluatedAt: now,
    attemptsUsed: 1,
    ...overrides,
  };
}

describe('repository profile registry and command policy', () => {
  it('validates GEO-Pulse and the portable profile while preserving the checked contract', () => {
    expect(validateRepositoryProfile(GEOPULSE_PROFILE)).toEqual([]);
    expect(validateRepositoryProfile(GEOPULSE_CANARY_PROFILE)).toEqual([]);
    expect(validateRepositoryProfile(PORTABLE_FIXTURE_PROFILE)).toEqual([]);
    const portableFile = JSON.parse(readFileSync(new URL('./portable-repo/.repair-agent/repository-profile.v1.json', import.meta.url), 'utf8')) as RepositoryProfile;
    expect(portableFile).toEqual(PORTABLE_FIXTURE_PROFILE);
    expect(profileSupportsAutonomousMerge(GEOPULSE_PROFILE)).toBe(true);
    expect(profileSupportsAutonomousMerge(PORTABLE_FIXTURE_PROFILE)).toBe(true);
  });

  it('selects a profile only for its explicit producer authority, repository, and origin', async () => {
    const registry = new RepositoryProfileRegistry([{ profile: PORTABLE_FIXTURE_PROFILE, authorities: ['local-disposable-test'] }]);
    await expect(registry.resolve({ profileId: PORTABLE_FIXTURE_PROFILE.id, authority: 'local-disposable-test', repository: 'example/portable-site', targetUrl: 'https://portable.example/audit' }))
      .resolves.toMatchObject({ profile: { id: PORTABLE_FIXTURE_PROFILE.id }, digest: portableDigest });
    await expect(registry.resolve({ profileId: PORTABLE_FIXTURE_PROFILE.id, authority: 'external-canary', targetUrl: 'https://portable.example/' })).resolves.toBeNull();
    await expect(registry.resolve({ profileId: PORTABLE_FIXTURE_PROFILE.id, authority: 'local-disposable-test', repository: 'other/repo', targetUrl: 'https://portable.example/' })).resolves.toBeNull();
    await expect(registry.resolve({ profileId: PORTABLE_FIXTURE_PROFILE.id, authority: 'local-disposable-test', targetUrl: 'https://evil.example/' })).resolves.toBeNull();
  });

  it('computes a canonical digest independent of JSON property order', async () => {
    const reordered = Object.fromEntries(Object.entries(PORTABLE_FIXTURE_PROFILE).reverse()) as RepositoryProfile;
    await expect(repositoryProfileDigest(reordered)).resolves.toBe(portableDigest);
  });

  it('rejects arbitrary command text, unsafe paths, ambiguous checks, and private QA origins', () => {
    const unsafe = {
      ...PORTABLE_FIXTURE_PROFILE,
      allowedPathPrefixes: ['../secrets'],
      qaCommandPresetId: 'npm run deploy',
      requiredChecks: [{ checkName: 'verify', appSlug: 'bad/app', appId: 1 }],
      repositoryAdapter: { ...PORTABLE_FIXTURE_PROFILE.repositoryAdapter, productionSmokeUrls: ['https://127.0.0.1/'] },
    } as unknown as RepositoryProfile;
    expect(validateRepositoryProfile(unsafe)).toEqual(expect.arrayContaining([
      'unsafe allowed path prefix: ../secrets', 'QA command preset is not installed', 'required check identity is invalid', 'production smoke URL is invalid',
    ]));
  });

  it('rejects reuse of one GitHub App authority across protected roles', () => {
    const shared = {
      ...PORTABLE_FIXTURE_PROFILE,
      roleIssuers: {
        ...PORTABLE_FIXTURE_PROFILE.roleIssuers,
        qa: [{ provider: 'github' as const, appSlug: 'portable-repair-reviewer', appId: 91001 }],
      },
    };
    expect(validateRepositoryProfile(shared)).toContain('protected role issuer App IDs must be pairwise distinct');
    expect(profileSupportsAutonomousMerge(shared)).toBe(false);
  });

  it('keeps logical and physical checkout paths separate', () => {
    expect(artifactPathAllowed(GEOPULSE_CANARY_PROFILE, 'repair-agent/test/portable-repo/public/robots.txt')).toBe(true);
    expect(artifactPathAllowed(GEOPULSE_CANARY_PROFILE, 'public/robots.txt')).toBe(false);
    expect(artifactPathAllowed(GEOPULSE_CANARY_PROFILE, 'repair-agent/test/portable-repo/../.env')).toBe(false);
  });
});

describe('audit intake and scoper', () => {
  it('selects at most one fresh supported finding and binds the installed profile digest into scope identity', async () => {
    const envelope = audit();
    const decision = selectAuditFinding({ envelope, profile: GEOPULSE_PROFILE, seenAuditRunIds: new Set(), nowMs });
    expect(decision.accepted).toBe(true);
    if (!decision.accepted) return;
    const first = await scopeRepair({ envelope, finding: decision.finding, profile: GEOPULSE_PROFILE, profileDigest: geoDigest, nowMs });
    const second = await scopeRepair({ envelope, finding: decision.finding, profile: GEOPULSE_PROFILE, profileDigest: geoDigest, nowMs });
    expect(first.repairId).toBe(second.repairId);
    expect(first.repositoryProfileDigest).toBe(geoDigest);
    expect(first).toMatchObject({ changeBudget: { maxFiles: 1, maxChangedLines: 4 }, issue: { retryPolicy: 'maximum_three_sha_bound_attempts' } });
    const admitted = admitRepair({
      schemaVersion: 1, mode: 'shadow', repository: first.repository, siteOrigin: first.siteOrigin, idempotencyKey: first.repairId,
      attempt: first.attempt, feedback: first.feedback,
      finding: { findingId: first.findingId, sourceAuditId: first.auditRunId, checkId: decision.finding.checkId, targetUrl: envelope.targetUrl, finding: decision.finding.finding, confidence: decision.finding.confidence, risk: decision.finding.risk, reportedAt: envelope.generatedAt },
      instruction: first.instruction, changeBudget: first.changeBudget, fixture: { files: { 'app/resources/page.tsx': '<a href="/articles/old-guide">Guide</a>\n' } },
    }, { mode: 'shadow', killSwitch: false, productionMutationsEnabled: false, repositoryAllowlist: ['forwauzz/geopulse'], originAllowlist: ['https://getgeopulse.com'], maxAttempts: 3 });
    expect(admitted).toMatchObject({ admitted: true });
  });

  it('fails closed for replay, stale audit, missing repair evidence, and traversal', () => {
    expect(parseAuditEnvelope(audit()).ok).toBe(true);
    expect(selectAuditFinding({ envelope: audit(), profile: GEOPULSE_PROFILE, seenAuditRunIds: new Set(['audit-run-1']), nowMs })).toMatchObject({ accepted: false });
    expect(selectAuditFinding({ envelope: audit({ generatedAt: '2026-08-17T00:00:00.000Z' }), profile: GEOPULSE_PROFILE, seenAuditRunIds: new Set(), nowMs })).toMatchObject({ accepted: false });
    expect(selectAuditFinding({ envelope: audit({ findings: [{ ...audit().findings[0]!, repairHint: undefined }] }), profile: GEOPULSE_PROFILE, seenAuditRunIds: new Set(), nowMs })).toMatchObject({ accepted: false });
    for (const path of ['app/../.github/workflows/x.yml', 'app\\page.tsx', '/app/page.tsx', 'C:/app/page.tsx', '//server/share']) {
      const envelope = audit({ findings: [{ ...audit().findings[0]!, repairHint: { instruction: { skillId: 'replace-broken-internal-link', path, from: '/old', to: '/new' } } }] });
      expect(selectAuditFinding({ envelope, profile: GEOPULSE_PROFILE, seenAuditRunIds: new Set(), nowMs }).accepted).toBe(false);
    }
  });

  it.each(['canonical-cloudflare-scheduler', 'canonical-cloudflare-admin', 'canonical-cloudflare-ci'] as const)(
    'parses truthful internal producer %s without accepting unknown identities',
    (producer) => {
      expect(parseAuditEnvelope(audit({ producer })).ok).toBe(true);
      expect(parseAuditEnvelope({ ...audit(), producer: 'canonical-cloudflare-unknown' }).ok).toBe(false);
    }
  );
});

describe('authenticated reviewer role', () => {
  it('recognizes only exact non-closing repair lineage markers', () => {
    expect(parseRepairIssueLineageMarkers('Tracks #27. Automated bounded repair.\nTracks #27')).toEqual([27]);
    expect(parseRepairIssueLineageMarkers('This tracks #27 in prose.\nCloses #28.')).toEqual([]);
  });

  it('parses only GitHub API-shaped check and pull-request observations', () => {
    expect(() => parseGitHubCheckRunObservation({ raw: { id: 1, head_sha: 'b'.repeat(40), conclusion: 'success', app: { slug: '../spoof', id: 1 } }, role: 'reviewer', repository: 'example/portable-site', observedAt: now })).toThrow('GitHub check-run app slug is invalid');
    expect(() => parseGitHubPullRequestObservation({ raw: { number: 1, state: 'open', mergeable: null, base: { ref: 'main', sha: 'a'.repeat(40) }, head: { sha: 'b'.repeat(40) } }, repository: 'example/portable-site', lineageIssueNumbers: [7], observedAt: now })).toThrow('GitHub pull-request mergeability is unresolved');
  });

  it('acquires repository and timestamps from a credential-owning GitHub adapter boundary', async () => {
    const calls: string[] = [];
    const reader = {
      async readCheckRun(repository: string, id: number) {
        calls.push(`check:${repository}:${id}`);
        return { id, head_sha: 'b'.repeat(40), conclusion: 'success', app: { slug: 'portable-repair-reviewer', id: 91001 } };
      },
      async readPullRequest(repository: string, number: number) {
        calls.push(`pull:${repository}:${number}`);
        return { number, state: 'open', mergeable: true, base: { ref: 'main', sha: 'a'.repeat(40) }, head: { sha: 'b'.repeat(40) } };
      },
      async readIssueLineageNumbers(repository: string, number: number) {
        calls.push(`links:${repository}:${number}`);
        return [7];
      },
    };
    const adapter = new GitHubObservationAdapter({ reader, repository: PORTABLE_FIXTURE_PROFILE.repository, clock: () => new Date('2026-08-19T16:00:00.000Z') });
    await expect(adapter.observeRole('reviewer', 101)).resolves.toMatchObject({ repository: PORTABLE_FIXTURE_PROFILE.repository, observedAt: now, appId: 91001 });
    await expect(adapter.observePullRequest(8)).resolves.toMatchObject({ repository: PORTABLE_FIXTURE_PROFILE.repository, number: 8, lineageIssueNumbers: [7], observedAt: now });
    expect(calls).toEqual(['check:example/portable-site:101', 'pull:example/portable-site:8', 'links:example/portable-site:8']);
  });

  it('accepts authorized SHA-bound observations and rejects spoofed issuer or tampering', async () => {
    const good = await reviewEngineerArtifact({ artifact: artifact(), profile: PORTABLE_FIXTURE_PROFILE, profileDigest: portableDigest, observation: observation('reviewer'), observedPatchDigest: 'c'.repeat(64) });
    expect(good.verdict).toBe('passed');
    const bad = await reviewEngineerArtifact({
      artifact: artifact(), profile: PORTABLE_FIXTURE_PROFILE, profileDigest: '9'.repeat(64),
      observation: observation('reviewer', { appId: 999, headSha: 'e'.repeat(40) }), observedPatchDigest: 'f'.repeat(64),
    });
    expect(bad).toMatchObject({ verdict: 'failed' });
    expect(bad.reasons).toEqual(expect.arrayContaining([
      'repository profile digest does not match the engineer artifact', 'reviewer issuer is not authorized by the repository profile', 'reviewer head SHA is stale', 'reviewer patch digest does not match',
    ]));
  });

});

describe('authenticated QA role', () => {
  it('runs only trusted command presets and returns bounded feedback', async () => {
    const qa = await qaEngineerArtifact({
      artifact: artifact(), profile: PORTABLE_FIXTURE_PROFILE, profileDigest: portableDigest, observation: observation('qa'), observedPatchDigest: 'c'.repeat(64),
      commandResults: [{ argv: ['npm', 'run', 'deploy'], exitCode: 1 }], postconditionPassed: false,
    });
    expect(qa.verdict).toBe('failed');
    expect(qa.reasons).toEqual(expect.arrayContaining(['QA command is not in the trusted preset: npm run deploy', 'QA command failed: npm run deploy', 'finding-specific postcondition failed']));
    const reviewer = await reviewEngineerArtifact({ artifact: artifact(), profile: PORTABLE_FIXTURE_PROFILE, profileDigest: portableDigest, observation: observation('reviewer'), observedPatchDigest: 'c'.repeat(64) });
    expect(feedbackForNextAttempt({ artifact: artifact(), reviewer, qa })).toMatchObject({ retry: true, nextAttempt: 2 });
    expect(feedbackForNextAttempt({ artifact: artifact({ attempt: 3 }), reviewer: { ...reviewer, attempt: 3 }, qa: { ...qa, attempt: 3 } })).toMatchObject({ retry: false, nextAttempt: null });
  });

  it('rejects duplicate or incomplete trusted command coverage', async () => {
    const qa = await qaEngineerArtifact({
      artifact: artifact(), profile: PORTABLE_FIXTURE_PROFILE, profileDigest: portableDigest, observation: observation('qa'), observedPatchDigest: 'c'.repeat(64),
      commandResults: [{ argv: ['node', '--test'], exitCode: 0 }, { argv: ['node', '--test'], exitCode: 0 }], postconditionPassed: true,
    });
    expect(qa).toMatchObject({ verdict: 'failed', reasons: expect.arrayContaining(['QA command evidence contains duplicates']) });
  });
});

describe('deterministic merge controller', () => {
  it('allows only an exact, fresh, independently observed portable repair', async () => {
    expect(await evaluateMergeGate(await mergeInput())).toEqual({ allowed: true, reasons: [] });
  });

  it('rejects tampered verdicts, stale PR state, missing lineage, shared principals, and disabled mode', async () => {
    const input = await mergeInput();
    const tamperedReviewer = { ...input.reviewer!, evidenceDigest: '0'.repeat(64) };
    const qaWithSharedPrincipal = { ...input.qa!, identity: input.reviewer!.identity, issuer: { ...input.qa!.issuer, appSlug: input.reviewer!.issuer.appSlug, appId: input.reviewer!.issuer.appId, checkRunId: input.reviewer!.issuer.checkRunId } };
    const decision = await evaluateMergeGate({
      ...input,
      enabled: false,
      reviewer: tamperedReviewer,
      qa: qaWithSharedPrincipal,
      pullRequest: { ...input.pullRequest, headSha: 'f'.repeat(40), lineageIssueNumbers: [], observedAt: '2026-08-19T15:00:00.000Z' },
    });
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reasons).toEqual(expect.arrayContaining([
      'autonomous merge is not enabled', 'reviewer evidence digest does not verify', 'pull request no longer points to the reviewed base and head SHAs',
      'pull request does not carry an authenticated bounded repair issue lineage', 'pull request observation is stale or invalid', 'engineer, reviewer, QA, and merge-controller App principals must be pairwise distinct',
    ]));
  });

  it('recomputes the profile digest and rejects caller-asserted green checks for the wrong SHA', async () => {
    const input = await mergeInput();
    const mutatedProfile = { ...PORTABLE_FIXTURE_PROFILE, maxChangedLines: 21 };
    const wrongShaChecks = input.checkRuns.map((check) => ({ ...check, headSha: 'f'.repeat(40) }));
    const decision = await evaluateMergeGate({ ...input, profile: mutatedProfile, checkRuns: wrongShaChecks });
    expect(decision).toMatchObject({ allowed: false, reasons: expect.arrayContaining([
      'repository profile digest does not verify',
      'required check is stale or not green: 15368:github-actions:verify',
    ]), });
  });

  it('requires the current role check observation to be the exact check run bound into its verdict', async () => {
    const input = await mergeInput();
    const substituted = input.checkRuns.map((check) => check.checkName === 'repair-review'
      ? { ...check, checkRunId: check.checkRunId + 1000 }
      : check);
    const decision = await evaluateMergeGate({ ...input, checkRuns: substituted });
    expect(decision).toMatchObject({ allowed: false, reasons: expect.arrayContaining([
      'required check observation is missing or ambiguous: 91001:portable-repair-reviewer:repair-review',
    ]) });
  });

  it('never accepts a digest-valid logical-shadow verdict at the authenticated gate', async () => {
    const input = await mergeInput();
    const { evidenceDigest: _prior, ...reviewerUnsigned } = input.reviewer!;
    const logicalUnsigned = { ...reviewerUnsigned, contractMode: 'logical-shadow-v1' };
    const logicalReviewer = { ...logicalUnsigned, evidenceDigest: await import('../src/loop/canonical').then(({ sha256 }) => sha256(logicalUnsigned)) } as unknown as NonNullable<MergeGateInput['reviewer']>;
    const decision = await evaluateMergeGate({ ...input, reviewer: logicalReviewer });
    expect(decision).toMatchObject({ allowed: false, reasons: expect.arrayContaining(['reviewer verdict schema or contract mode is unsupported']) });
  });

  it('keeps provisioned GEO-Pulse auto-merge blocked for evidence issued by another repository profile', async () => {
    const portable = await mergeInput();
    const geoArtifact = artifact({ repositoryProfileId: GEOPULSE_PROFILE.id, repositoryProfileDigest: geoDigest, repository: GEOPULSE_PROFILE.repository, changedPaths: ['public/robots.txt'] });
    const decision = await evaluateMergeGate({
      ...portable,
      artifact: geoArtifact,
      profile: GEOPULSE_PROFILE,
      profileDigest: geoDigest,
      pullRequest: { ...portable.pullRequest, repository: GEOPULSE_PROFILE.repository, baseSha: geoArtifact.baseSha, headSha: geoArtifact.headSha },
    });
    expect(decision).toMatchObject({ allowed: false, reasons: expect.arrayContaining([
      'engineer issuer is not authorized by the repository profile',
      'reviewer issuer is not authorized by the repository profile',
      'qa issuer is not authorized by the repository profile',
      'merge-controller issuer is not authorized by the repository profile',
    ]) });
  });
});

describe('deployment QA', () => {
  it('binds successful production probes to an exact deployment version and source SHA', async () => {
    const adapter = new DeploymentEvidenceAdapter({
      profile: PORTABLE_FIXTURE_PROFILE,
      clock: () => new Date('2026-08-19T16:01:00.000Z'),
      reader: {
        async readDeployment(args) {
          expect(args).toEqual({ provider: 'fixture', repository: PORTABLE_FIXTURE_PROFILE.repository, deploymentId: 'deploy-1' });
          return { provider: 'fixture' as const, deploymentId: 'deploy-1', versionId: 'version-1', sourceSha: 'b'.repeat(40), environment: 'production' as const, observedAt: now };
        },
        async probe(url) {
          return { url, finalUrl: url, status: 200, bodyDigest: '1'.repeat(64) };
        },
      },
    });
    const acquired = await adapter.acquire({ deploymentId: 'deploy-1', sourceSha: 'b'.repeat(40), environment: 'production' });
    const result = await evaluateDeploymentQa({
      profile: PORTABLE_FIXTURE_PROFILE, profileDigest: portableDigest, repairId: 'repair-1', expectedSourceSha: 'b'.repeat(40),
      expectedDeploymentId: 'deploy-1', expectedVersionId: 'version-1',
      ...acquired,
    });
    expect(result).toMatchObject({ verdict: 'passed', sourceSha: 'b'.repeat(40), deploymentId: 'deploy-1', evidenceDigest: expect.stringMatching(/^[a-f0-9]{64}$/) });
  });

  it('requires the complete configured preview route inventory', async () => {
    const sourceSha = 'b'.repeat(40);
    const root = `https://preview-${sourceSha}.portable.example/`;
    const result = await evaluateDeploymentQa({
      profile: PORTABLE_FIXTURE_PROFILE, profileDigest: portableDigest, repairId: 'repair-1', expectedSourceSha: sourceSha,
      expectedDeploymentId: 'preview-1', expectedVersionId: 'preview-version-1', evaluatedAt: '2026-08-19T16:01:00.000Z',
      observation: { provider: 'fixture', deploymentId: 'preview-1', versionId: 'preview-version-1', sourceSha, environment: 'preview', observedAt: now },
      probes: [root, `${root}robots.txt`].map((url, index) => ({ url, finalUrl: url, status: 200, bodyDigest: String(index + 3).repeat(64) })),
    });
    expect(result).toMatchObject({ verdict: 'passed', probeEvidenceDigest: expect.stringMatching(/^[a-f0-9]{64}$/) });
  });

  it('rejects version mismatch, off-origin redirects, missing URLs, and failed probes', async () => {
    const result = await evaluateDeploymentQa({
      profile: PORTABLE_FIXTURE_PROFILE, profileDigest: portableDigest, repairId: 'repair-1', expectedSourceSha: 'b'.repeat(40),
      expectedDeploymentId: 'deploy-expected', expectedVersionId: 'version-expected',
      evaluatedAt: '2026-08-19T17:00:00.000Z',
      observation: { provider: 'cloudflare', deploymentId: 'deploy-1', versionId: 'version-1', sourceSha: 'a'.repeat(40), environment: 'production', observedAt: now },
      probes: [{ url: 'https://portable.example/', finalUrl: 'https://evil.example/', status: 500, bodyDigest: 'bad' }],
    });
    expect(result).toMatchObject({ verdict: 'failed', reasons: expect.arrayContaining([
      'deployment provider does not match the installed repository profile', 'deployment source SHA does not match', 'deployment ID or version does not match the released artifact', 'deployment observation time is stale or invalid', 'deployment probe redirected outside its exact URL contract: https://portable.example/', 'deployment probe failed: https://portable.example/',
      'deployment probe body digest is invalid: https://portable.example/', 'deployment probe is missing: https://portable.example/robots.txt',
    ]), });
  });
});
