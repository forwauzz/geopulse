import type { RepositoryProfile } from './contracts';

const SAFE_COMMAND = /^(?:npm|npx|node) [A-Za-z0-9@._:/ -]+$/;
const SAFE_PREFIX = /^(?![A-Za-z]:)(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/;
const ALLOWED_SKILLS = new Set(['ensure-robots-sitemap', 'remove-sitemap-url', 'replace-broken-internal-link']);

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
  try {
    if (new URL(profile.siteOrigin).protocol !== 'https:') failures.push('site origin must use https');
  } catch {
    failures.push('site origin is invalid');
  }
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
  if (profile.repositoryAdapter.checkoutRoot !== null && !safeRelativePath(profile.repositoryAdapter.checkoutRoot)) {
    failures.push('repository checkout root is invalid');
  }
  if (profile.repositoryAdapter.previewUrlTemplate !== null) {
    try {
      const preview = new URL(profile.repositoryAdapter.previewUrlTemplate.replace('{sha}', 'a'.repeat(40)));
      if (preview.protocol !== 'https:' || preview.username || preview.password || !profile.repositoryAdapter.previewUrlTemplate.includes('{sha}')) failures.push('preview URL template is invalid');
    } catch {
      failures.push('preview URL template is invalid');
    }
  }
  if (profile.repositoryAdapter.productionSmokeUrls.length === 0) failures.push('production smoke URLs cannot be empty');
  for (const url of profile.repositoryAdapter.productionSmokeUrls) {
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password) failures.push('production smoke URL is invalid');
    } catch {
      failures.push('production smoke URL is invalid');
    }
  }
  if (profile.requiredChecks.length === 0) failures.push('required checks cannot be empty');
  for (const check of profile.requiredChecks) {
    if (!/^[A-Za-z0-9_. /-]{1,100}$/.test(check.workflow) || !/^[A-Za-z0-9_. /-]{1,100}$/.test(check.job) || !/^[A-Za-z0-9-]{1,50}$/.test(check.appSlug)) {
      failures.push('required check identity is invalid');
    }
  }
  const commands = Object.values(profile.qaCommands).flat();
  if (commands.length === 0) failures.push('at least one QA command is required');
  for (const command of commands) {
    if (!SAFE_COMMAND.test(command) || /(?:--force|publish|deploy|secret|curl|wget|powershell|bash|sh )/i.test(command)) {
      failures.push(`unsafe QA command: ${command}`);
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
    checkoutRoot: null,
    previewUrlTemplate: null,
    productionSmokeUrls: ['https://getgeopulse.com/', 'https://getgeopulse.com/robots.txt', 'https://getgeopulse.com/sitemap.xml'],
  },
  requiredChecks: [
    { workflow: 'CI', job: 'verify', appSlug: 'github-actions' },
    { workflow: 'Repair Review', job: 'repair-review', appSlug: 'geo-pulse-repair-reviewer' },
    { workflow: 'Repair QA', job: 'repair-qa', appSlug: 'geo-pulse-repair-qa' },
  ],
  qaCommands: {
    focused: ['npm run test'],
    affected: ['npm run test'],
    typeCheck: ['npm run type-check'],
    build: ['node scripts/opennext-build.cjs'],
    browser: ['npx playwright test'],
  },
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
    checkoutRoot: null,
    previewUrlTemplate: 'https://preview-{sha}.portable.example/',
    productionSmokeUrls: ['https://portable.example/', 'https://portable.example/robots.txt'],
  },
  requiredChecks: [
    { workflow: 'CI', job: 'verify', appSlug: 'github-actions' },
    { workflow: 'Repair Review', job: 'repair-review', appSlug: 'portable-repair-reviewer' },
    { workflow: 'Repair QA', job: 'repair-qa', appSlug: 'portable-repair-qa' },
  ],
  qaCommands: {
    focused: ['npm run test'],
    affected: [],
    typeCheck: ['npm run type-check'],
    build: ['npm run build'],
    browser: [],
  },
};
