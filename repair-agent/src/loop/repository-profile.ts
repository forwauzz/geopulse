import { isQaCommandPresetId } from './command-presets';
import type { GitHubIssuerPolicy, RepairRole, RepositoryProfile } from './contracts';

const SAFE_PREFIX = /^(?![A-Za-z]:)(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/;
const ALLOWED_SKILLS = new Set(['ensure-robots-sitemap', 'remove-sitemap-url', 'replace-broken-internal-link']);
const ROLE_NAMES: readonly RepairRole[] = ['engineer', 'reviewer', 'qa', 'merge-controller'];

function publicHttpsUrl(value: string): URL | null {
  try {
    const parsed = new URL(value);
    const host = parsed.hostname.toLowerCase();
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) return null;
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.startsWith('[')) return null;
    return parsed;
  } catch {
    return null;
  }
}

function validIssuer(policy: GitHubIssuerPolicy): boolean {
  return policy.provider === 'github'
    && /^[A-Za-z0-9-]{1,50}$/.test(policy.appSlug)
    && (policy.appId === null || (Number.isSafeInteger(policy.appId) && policy.appId > 0));
}

function safeBranchName(value: string): boolean {
  const invalidCharacter = [...value].some((character) => character.charCodeAt(0) <= 32 || '~^:?*[]\\'.includes(character));
  return value.length > 0
    && value.length <= 255
    && !value.startsWith('/')
    && !value.endsWith('/')
    && !value.endsWith('.')
    && !value.includes('..')
    && !value.includes('@{')
    && !invalidCharacter
    && value.split('/').every((segment) => segment.length > 0 && segment !== '.' && !segment.endsWith('.lock'));
}

export function safeRelativePath(path: string): boolean {
  if (!SAFE_PREFIX.test(path) || path.includes('\\') || path.startsWith('/') || /^[A-Za-z]:/.test(path)) return false;
  const segments = path.split('/');
  return segments.length > 0 && segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

export function validateRepositoryProfile(profile: RepositoryProfile): string[] {
  const failures: string[] = [];
  if (profile.schemaVersion !== 1) failures.push('repository profile schema is unsupported');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(profile.repository)) failures.push('repository is invalid');
  if (!safeBranchName(profile.defaultBranch)) failures.push('default branch is invalid');
  const site = publicHttpsUrl(profile.siteOrigin);
  if (!site) failures.push('site origin must be a public credential-free https URL');
  if (profile.allowedPathPrefixes.length === 0) failures.push('at least one allowed path prefix is required');
  for (const prefix of profile.allowedPathPrefixes) {
    if (!safeRelativePath(prefix) || /(^|\/)(?:\.git|\.env|secrets?|credentials?)(?:\/|$)/i.test(prefix)) {
      failures.push(`unsafe allowed path prefix: ${prefix}`);
    }
  }
  if (profile.maxFiles < 1 || profile.maxFiles > 3) failures.push('maxFiles must be between 1 and 3');
  if (profile.maxChangedLines < 1 || profile.maxChangedLines > 100) failures.push('maxChangedLines must be between 1 and 100');
  if (profile.skillAllowlist.length === 0 || profile.skillAllowlist.some((skill) => !ALLOWED_SKILLS.has(skill))) failures.push('skill allowlist is invalid');
  if (profile.repositoryAdapter.provider !== 'github' || profile.repositoryAdapter.installationMode !== 'github_app' || profile.repositoryAdapter.deploymentStrategy !== 'merge_to_default_branch') {
    failures.push('repository adapter contract is unsupported');
  }
  if (profile.repositoryAdapter.deploymentProvider !== 'cloudflare' && profile.repositoryAdapter.deploymentProvider !== 'fixture') failures.push('deployment provider is unsupported');
  if (profile.repositoryAdapter.checkoutRoot !== null && !safeRelativePath(profile.repositoryAdapter.checkoutRoot)) {
    failures.push('repository checkout root is invalid');
  }
  if (profile.repositoryAdapter.previewUrlTemplate !== null) {
    const preview = publicHttpsUrl(profile.repositoryAdapter.previewUrlTemplate.replace('{sha}', 'a'.repeat(40)));
    if (!preview || !profile.repositoryAdapter.previewUrlTemplate.includes('{sha}')) failures.push('preview URL template is invalid');
    if (profile.repositoryAdapter.previewSmokePaths.length === 0) failures.push('preview smoke paths cannot be empty when preview is configured');
  } else if (profile.repositoryAdapter.previewSmokePaths.length > 0) {
    failures.push('preview smoke paths require a preview URL template');
  }
  for (const path of profile.repositoryAdapter.previewSmokePaths) {
    if (!/^\/(?:[A-Za-z0-9._~!$&'()*+,;=:@/-]*)$/.test(path) || path.includes('..') || path.includes('//')) failures.push('preview smoke path is invalid');
  }
  if (profile.repositoryAdapter.productionSmokeUrls.length === 0) failures.push('production smoke URLs cannot be empty');
  for (const url of profile.repositoryAdapter.productionSmokeUrls) {
    const parsed = publicHttpsUrl(url);
    if (!parsed || (site && parsed.origin !== site.origin)) failures.push('production smoke URL is invalid');
  }
  if (profile.requiredChecks.length === 0) failures.push('required checks cannot be empty');
  for (const check of profile.requiredChecks) {
    if (!/^[A-Za-z0-9_. /-]{1,100}$/.test(check.checkName) || !/^[A-Za-z0-9-]{1,50}$/.test(check.appSlug)
      || (check.appId !== null && (!Number.isSafeInteger(check.appId) || check.appId <= 0))) {
      failures.push('required check identity is invalid');
    }
  }
  if (!isQaCommandPresetId(profile.qaCommandPresetId)) failures.push('QA command preset is not installed');
  for (const role of ROLE_NAMES) {
    const issuers = profile.roleIssuers[role];
    if (!Array.isArray(issuers) || issuers.length === 0 || issuers.some((issuer) => !validIssuer(issuer))) {
      failures.push(`${role} issuer policy is invalid`);
    }
  }
  const issuerRoles = new Map<number, RepairRole>();
  for (const role of ROLE_NAMES) {
    for (const issuer of profile.roleIssuers[role]) {
      if (issuer.appId === null) continue;
      const priorRole = issuerRoles.get(issuer.appId);
      if (priorRole && priorRole !== role) failures.push('protected role issuer App IDs must be pairwise distinct');
      issuerRoles.set(issuer.appId, role);
    }
  }
  return [...new Set(failures)];
}

export function pathAllowed(profile: RepositoryProfile, path: string): boolean {
  return safeRelativePath(path) && profile.allowedPathPrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function artifactPathAllowed(profile: RepositoryProfile, path: string): boolean {
  if (!safeRelativePath(path)) return false;
  const checkoutRoot = profile.repositoryAdapter.checkoutRoot;
  if (checkoutRoot && !path.startsWith(`${checkoutRoot}/`)) return false;
  const logicalPath = checkoutRoot ? path.slice(checkoutRoot.length + 1) : path;
  return profile.allowedPathPrefixes.some((prefix) => logicalPath === prefix || logicalPath.startsWith(`${prefix}/`));
}

export function issuerAllowed(profile: RepositoryProfile, role: RepairRole, appSlug: string, appId: number): boolean {
  return profile.roleIssuers[role].some((policy) => policy.appSlug === appSlug && policy.appId === appId);
}

export function profileSupportsAutonomousMerge(profile: RepositoryProfile): boolean {
  return validateRepositoryProfile(profile).length === 0
    && ROLE_NAMES.every((role) => profile.roleIssuers[role].some((issuer) => issuer.appId !== null))
    && profile.requiredChecks.every((check) => check.appId !== null);
}

export const GEOPULSE_PROFILE: RepositoryProfile = {
  schemaVersion: 1,
  id: 'geopulse-v1',
  repository: 'forwauzz/geopulse',
  defaultBranch: 'main',
  siteOrigin: 'https://getgeopulse.com',
  allowedPathPrefixes: ['public', 'app', 'lib', 'workers'],
  skillAllowlist: ['ensure-robots-sitemap', 'remove-sitemap-url', 'replace-broken-internal-link'],
  maxFiles: 1,
  maxChangedLines: 30,
  repositoryAdapter: {
    provider: 'github',
    installationMode: 'github_app',
    deploymentStrategy: 'merge_to_default_branch',
    deploymentProvider: 'cloudflare',
    checkoutRoot: null,
    previewUrlTemplate: null,
    previewSmokePaths: [],
    productionSmokeUrls: ['https://getgeopulse.com/', 'https://getgeopulse.com/robots.txt', 'https://getgeopulse.com/sitemap.xml'],
  },
  requiredChecks: [
    { checkName: 'verify', appSlug: 'github-actions', appId: 15368 },
    { checkName: 'repair-review', appSlug: 'geo-pulse-repair-reviewer', appId: null },
    { checkName: 'repair-qa', appSlug: 'geo-pulse-repair-qa', appId: null },
  ],
  roleIssuers: {
    engineer: [{ provider: 'github', appSlug: 'github-actions', appId: 15368 }],
    reviewer: [{ provider: 'github', appSlug: 'geo-pulse-repair-reviewer', appId: null }],
    qa: [{ provider: 'github', appSlug: 'geo-pulse-repair-qa', appId: null }],
    'merge-controller': [{ provider: 'github', appSlug: 'geo-pulse-repair-merge', appId: null }],
  },
  qaCommandPresetId: 'geopulse-safe-v1',
};

export const GEOPULSE_CANARY_PROFILE: RepositoryProfile = {
  ...GEOPULSE_PROFILE,
  id: 'geopulse-canary-v1',
  repositoryAdapter: {
    ...GEOPULSE_PROFILE.repositoryAdapter,
    checkoutRoot: 'repair-agent/test/portable-repo',
  },
};

export const PORTABLE_FIXTURE_PROFILE: RepositoryProfile = {
  schemaVersion: 1,
  id: 'portable-fixture-v1',
  repository: 'example/portable-site',
  defaultBranch: 'main',
  siteOrigin: 'https://portable.example',
  allowedPathPrefixes: ['public', 'src'],
  skillAllowlist: ['ensure-robots-sitemap', 'remove-sitemap-url', 'replace-broken-internal-link'],
  maxFiles: 1,
  maxChangedLines: 20,
  repositoryAdapter: {
    provider: 'github',
    installationMode: 'github_app',
    deploymentStrategy: 'merge_to_default_branch',
    deploymentProvider: 'fixture',
    checkoutRoot: null,
    previewUrlTemplate: 'https://preview-{sha}.portable.example/',
    previewSmokePaths: ['/', '/robots.txt'],
    productionSmokeUrls: ['https://portable.example/', 'https://portable.example/robots.txt'],
  },
  requiredChecks: [
    { checkName: 'verify', appSlug: 'github-actions', appId: 15368 },
    { checkName: 'repair-review', appSlug: 'portable-repair-reviewer', appId: 91001 },
    { checkName: 'repair-qa', appSlug: 'portable-repair-qa', appId: 91002 },
  ],
  roleIssuers: {
    engineer: [{ provider: 'github', appSlug: 'portable-repair-engineer', appId: 91000 }],
    reviewer: [{ provider: 'github', appSlug: 'portable-repair-reviewer', appId: 91001 }],
    qa: [{ provider: 'github', appSlug: 'portable-repair-qa', appId: 91002 }],
    'merge-controller': [{ provider: 'github', appSlug: 'portable-repair-merge', appId: 91003 }],
  },
  qaCommandPresetId: 'portable-static-safe-v1',
};
