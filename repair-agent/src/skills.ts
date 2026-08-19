import type { RepairRequest, RepairSkillId } from './contracts';

export type RepairTool = 'sandbox:file-read' | 'sandbox:file-write' | 'sandbox:command-exec' | 'qa:evaluate';

export type RepairSkillContract = {
  id: RepairSkillId;
  version: string;
  allowedCheckIds: readonly string[];
  allowedTools: readonly RepairTool[];
  maximumFiles: number;
  maximumChangedLines: number;
  pathPattern: RegExp;
  postcondition: string;
};

const SHADOW_TOOLS = [
  'sandbox:file-read',
  'sandbox:file-write',
  'sandbox:command-exec',
  'qa:evaluate',
] as const;

export const REPAIR_SKILLS: Readonly<Record<RepairSkillId, RepairSkillContract>> = {
  'ensure-robots-sitemap': {
    id: 'ensure-robots-sitemap',
    version: '1.0.0',
    allowedCheckIds: ['robots-txt', 'robots-sitemap'],
    allowedTools: SHADOW_TOOLS,
    maximumFiles: 1,
    maximumChangedLines: 8,
    pathPattern: /^public\/robots\.txt$/,
    postcondition: 'robots.txt contains exactly one Sitemap directive for the approved site origin',
  },
  'remove-sitemap-url': {
    id: 'remove-sitemap-url',
    version: '1.0.0',
    allowedCheckIds: ['sitemap-url-safety', 'sitemap-indexability'],
    allowedTools: SHADOW_TOOLS,
    maximumFiles: 1,
    maximumChangedLines: 8,
    pathPattern: /^(?:app|public|src)\/[A-Za-z0-9._/-]*(?:sitemap|site-map)[A-Za-z0-9._/-]*\.(?:ts|tsx|js|mjs|xml)$/,
    postcondition: 'the exact rejected URL is absent while every unrelated fixture file is byte-identical',
  },
  'replace-broken-internal-link': {
    id: 'replace-broken-internal-link',
    version: '1.0.0',
    allowedCheckIds: ['broken-internal-link'],
    allowedTools: SHADOW_TOOLS,
    maximumFiles: 1,
    maximumChangedLines: 4,
    pathPattern: /^(?:app|content|docs|src)\/[A-Za-z0-9._/-]+\.(?:html|md|mdx|ts|tsx)$/,
    postcondition: 'the unique broken target is replaced with the approved same-origin target',
  },
};

export function getRepairSkill(id: RepairSkillId): RepairSkillContract {
  return REPAIR_SKILLS[id];
}

export function validateInstructionAgainstSkill(request: RepairRequest): string[] {
  const skill = getRepairSkill(request.instruction.skillId);
  const failures: string[] = [];
  if (!skill.allowedCheckIds.includes(request.finding.checkId)) {
    failures.push(`check ${request.finding.checkId} is not handled by ${skill.id}`);
  }
  if (!skill.pathPattern.test(request.instruction.path)) {
    failures.push(`path ${request.instruction.path} is outside the ${skill.id} allowlist`);
  }
  if (request.changeBudget.maxFiles > skill.maximumFiles) {
    failures.push(`file budget exceeds the ${skill.id} maximum`);
  }
  if (request.changeBudget.maxChangedLines > skill.maximumChangedLines) {
    failures.push(`changed-line budget exceeds the ${skill.id} maximum`);
  }
  return failures;
}
