import { describe, expect, it } from 'vitest';
import { parseRepairRequest } from '../src/contracts';
import { admitRepair, policyConfigFromEnv, type RepairPolicyConfig } from '../src/policy';
import { validRepairRequest } from './fixtures';

const policy: RepairPolicyConfig = {
  mode: 'shadow',
  killSwitch: false,
  productionMutationsEnabled: false,
  repositoryAllowlist: ['forwauzz/geopulse'],
  originAllowlist: ['https://getgeopulse.com'],
  maxAttempts: 3,
};

describe('repair request contract and admission policy', () => {
  it('admits a bounded high-confidence low-risk finding', () => {
    const request = validRepairRequest();
    expect(parseRepairRequest(request)).toEqual({ ok: true, request });
    expect(admitRepair(request, policy)).toEqual({ admitted: true, reasons: [], maxAttempts: 3 });
  });

  it.each([
    ['kill switch', { ...policy, killSwitch: true }],
    ['wrong repository', { ...policy, repositoryAllowlist: ['another/repo'] }],
    ['wrong origin', { ...policy, originAllowlist: ['https://example.com'] }],
    ['wrong attempt ceiling', { ...policy, maxAttempts: 4 }],
  ] as const)('fails closed for %s', (_label, modifiedPolicy) => {
    const decision = admitRepair(validRepairRequest(), modifiedPolicy);
    expect(decision.admitted).toBe(false);
  });

  it('rejects non-high-confidence and non-low-risk findings', () => {
    const request = validRepairRequest();
    request.finding.confidence = 'medium';
    request.finding.risk = 'high';
    const decision = admitRepair(request, policy);
    expect(decision).toMatchObject({ admitted: false });
    if (!decision.admitted) {
      expect(decision.reasons).toContain('only high-confidence findings are eligible');
      expect(decision.reasons).toContain('only low-risk findings are eligible');
    }
  });

  it('rejects traversal and secret paths', () => {
    const traversal = validRepairRequest();
    traversal.instruction.path = '../outside.ts';
    traversal.fixture.files['../outside.ts'] = 'secret';
    expect(admitRepair(traversal, policy).admitted).toBe(false);

    const secret = validRepairRequest();
    secret.instruction.path = '.env.production';
    secret.fixture.files['.env.production'] = 'TOKEN=value';
    expect(admitRepair(secret, policy).admitted).toBe(false);
  });

  it('rejects a skill that is incompatible with the audit check', () => {
    const request = validRepairRequest();
    request.finding.checkId = 'robots-txt';
    const decision = admitRepair(request, policy);
    expect(decision.admitted).toBe(false);
    if (!decision.admitted) {
      expect(decision.reasons).toContain(
        'check robots-txt is not handled by replace-broken-internal-link'
      );
    }
  });

  it('parses and admits only the exact retrieval-agent repair contract', () => {
    const request = validRepairRequest();
    request.finding.checkId = 'ai-crawler-access';
    request.finding.findingId = 'retrieval-contract';
    request.instruction = { skillId: 'allow-ai-retrieval-agents', path: 'app/robots.ts' };
    request.changeBudget = { maxFiles: 1, maxChangedLines: 10 };
    request.fixture = {
      files: {
        'app/robots.ts': "export default async function robots() {\n  return { rules: [{ userAgent: '*', allow: '/' }] };\n}\n",
      },
    };

    expect(parseRepairRequest(request)).toEqual({ ok: true, request });
    expect(admitRepair(request, policy)).toMatchObject({ admitted: true });
    expect(parseRepairRequest({
      ...request,
      instruction: { skillId: 'allow-ai-retrieval-agents', path: 'workers/robots.ts' },
    })).toEqual({ ok: false, reason: 'allow-ai-retrieval-agents may only write app/robots.ts' });
  });

  it('parses only shadow-mode schema v1 requests', () => {
    const request = { ...validRepairRequest(), mode: 'production' };
    expect(parseRepairRequest(request)).toEqual({ ok: false, reason: 'only shadow mode is supported' });
  });

  it('requires bounded feedback on retries and forbids it on attempt one', () => {
    const retry = { ...validRepairRequest(), attempt: 2, feedback: ['QA found a canonical mismatch'] };
    expect(parseRepairRequest(retry)).toEqual({ ok: true, request: retry });
    expect(admitRepair(retry, policy)).toMatchObject({ admitted: true });
    expect(admitRepair({ ...retry, feedback: [] }, policy)).toMatchObject({ admitted: false, reasons: expect.arrayContaining(['retry attempt requires bounded prior feedback']) });
    expect(admitRepair({ ...validRepairRequest(), feedback: ['unexpected'] }, policy)).toMatchObject({ admitted: false, reasons: expect.arrayContaining(['first attempt cannot contain prior feedback']) });
    expect(parseRepairRequest({ ...retry, feedback: Array.from({ length: 11 }, () => 'too many') })).toEqual({ ok: false, reason: 'feedback must contain at most 10 items' });
  });

  it('refuses an environment that enables production mutations', () => {
    expect(() =>
      policyConfigFromEnv({
        REPAIR_MODE: 'shadow',
        REPAIR_TARGET_REPOSITORY: 'forwauzz/geopulse',
        REPAIR_TARGET_ORIGIN: 'https://getgeopulse.com',
        REPAIR_MAX_ATTEMPTS: '3',
        REPAIR_KILL_SWITCH: 'false',
        REPAIR_PRODUCTION_MUTATIONS_ENABLED: 'true',
      })
    ).toThrow('production mutations are forbidden in the proof');
  });
});
