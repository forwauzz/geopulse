import type { RepositoryProfile } from './contracts';

const SAFE_COMMAND = /^(?:npm|npx|node) [A-Za-z0-9@._:/ -]+$/;
const SAFE_PREFIX = /^(?![A-Za-z]:)(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9._/-]+$/;

export function safeRelativePath(path: string): boolean {
  if (!SAFE_PREFIX.test(path) || path.includes('\\') || path.startsWith('/') || /^[A-Za-z]:/.test(path)) return false;
  const segments = path.split('/');
  return segments.length > 0 && segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

export function validateRepositoryProfile(profile: RepositoryProfile): string[] {
  const failures: string[] = [];
  if (profile.schemaVersion !== 1) failures.push('repository profile schema is unsupported');
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(profile.repository)) failures.push('repository is invalid');
  if (!/^[A-Za-z0-9._/-]+$/.test(profile.defaultBranch)) failures.push('default branch is invalid');
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
  if (profile.requiredChecks.length === 0) failures.push('required checks cannot be empty');
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
  requiredChecks: ['verify'],
  qaCommands: {
    focused: ['npm run test'],
    affected: ['npm run test'],
    typeCheck: ['npm run type-check'],
    build: ['node scripts/opennext-build.cjs'],
    browser: ['npx playwright test'],
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
  requiredChecks: ['repair-review', 'repair-qa'],
  qaCommands: {
    focused: ['npm run test'],
    affected: [],
    typeCheck: ['npm run type-check'],
    build: ['npm run build'],
    browser: [],
  },
};
