import type { RepairRequest } from './contracts';
import { validateInstructionAgainstSkill } from './skills';

export type RepairPolicyConfig = {
  mode: 'shadow';
  killSwitch: boolean;
  productionMutationsEnabled: false;
  repositoryAllowlist: readonly string[];
  originAllowlist: readonly string[];
  maxAttempts: number;
};

export type AdmissionDecision =
  | { admitted: true; reasons: []; maxAttempts: number }
  | { admitted: false; reasons: string[]; maxAttempts: 0 };

const SENSITIVE_PATH = /(^|\/)(?:\.env(?:\.|$)|secrets?(?:\.|\/|$)|credentials?(?:\.|\/|$)|\.git(?:\/|$))/i;
const SAFE_RELATIVE_PATH = /^(?![A-Za-z]:)(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/;

function normalizedOrigin(value: string): string | null {
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function isAllowedPath(path: string): boolean {
  return SAFE_RELATIVE_PATH.test(path) && !path.includes('\\') && !SENSITIVE_PATH.test(path);
}

function linkTargetAllowed(value: string, siteOrigin: string): boolean {
  if (value.startsWith('/')) return !value.startsWith('//');
  try {
    return new URL(value).origin === siteOrigin;
  } catch {
    return false;
  }
}

export function admitRepair(request: RepairRequest, config: RepairPolicyConfig): AdmissionDecision {
  const reasons: string[] = [];
  if (config.killSwitch) reasons.push('repair kill switch is active');
  if (config.mode !== 'shadow' || request.mode !== 'shadow') reasons.push('only shadow mode is allowed');
  if (config.productionMutationsEnabled) reasons.push('production mutation must remain disabled in this proof');
  if (!config.repositoryAllowlist.includes(request.repository)) reasons.push('repository is not allowlisted');

  const requestOrigin = normalizedOrigin(request.siteOrigin);
  const targetOrigin = normalizedOrigin(request.finding.targetUrl);
  if (requestOrigin === null || !config.originAllowlist.includes(requestOrigin)) {
    reasons.push('site origin is not allowlisted');
  }
  if (targetOrigin !== requestOrigin) reasons.push('finding target is outside the approved site origin');
  if (request.finding.confidence !== 'high') reasons.push('only high-confidence findings are eligible');
  if (request.finding.risk !== 'low') reasons.push('only low-risk findings are eligible');
  if (config.maxAttempts !== 3) reasons.push('the proof requires an exact three-attempt ceiling');
  if (request.attempt === 1 && request.feedback.length > 0) reasons.push('first attempt cannot contain prior feedback');
  if (request.attempt > 1 && request.feedback.length === 0) reasons.push('retry attempt requires bounded prior feedback');

  const allPaths = [...Object.keys(request.fixture.files), request.instruction.path];
  for (const path of allPaths) {
    if (!isAllowedPath(path)) reasons.push(`path ${path} is unsafe or sensitive`);
  }
  if (!(request.instruction.path in request.fixture.files) && request.instruction.skillId !== 'ensure-robots-sitemap') {
    reasons.push('the target file is missing from the shadow fixture');
  }

  if (request.instruction.skillId === 'ensure-robots-sitemap') {
    if (new URL(request.instruction.sitemapUrl).origin !== requestOrigin) {
      reasons.push('sitemap URL is outside the approved site origin');
    }
  } else if (request.instruction.skillId === 'remove-sitemap-url') {
    if (new URL(request.instruction.url).origin !== requestOrigin) {
      reasons.push('removed sitemap URL is outside the approved site origin');
    }
  } else {
    if (!linkTargetAllowed(request.instruction.to, requestOrigin ?? '')) {
      reasons.push('replacement link is not same-origin');
    }
    if (request.instruction.from === request.instruction.to) {
      reasons.push('replacement link must differ from the broken link');
    }
  }

  reasons.push(...validateInstructionAgainstSkill(request));
  const uniqueReasons = [...new Set(reasons)];
  return uniqueReasons.length === 0
    ? { admitted: true, reasons: [], maxAttempts: config.maxAttempts }
    : { admitted: false, reasons: uniqueReasons, maxAttempts: 0 };
}

export function policyConfigFromEnv(env: {
  REPAIR_MODE: string;
  REPAIR_TARGET_REPOSITORY: string;
  REPAIR_TARGET_ORIGIN: string;
  REPAIR_MAX_ATTEMPTS: string;
  REPAIR_KILL_SWITCH: string;
  REPAIR_PRODUCTION_MUTATIONS_ENABLED: string;
}): RepairPolicyConfig {
  if (env.REPAIR_MODE !== 'shadow') throw new Error('REPAIR_MODE must be shadow');
  if (env.REPAIR_PRODUCTION_MUTATIONS_ENABLED !== 'false') {
    throw new Error('production mutations are forbidden in the proof');
  }
  const maxAttempts = Number.parseInt(env.REPAIR_MAX_ATTEMPTS, 10);
  return {
    mode: 'shadow',
    killSwitch: env.REPAIR_KILL_SWITCH !== 'false',
    productionMutationsEnabled: false,
    repositoryAllowlist: [env.REPAIR_TARGET_REPOSITORY],
    originAllowlist: [new URL(env.REPAIR_TARGET_ORIGIN).origin],
    maxAttempts,
  };
}
