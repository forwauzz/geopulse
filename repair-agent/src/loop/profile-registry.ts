import { sha256 } from './canonical';
import type { RepositoryProfile } from './contracts';
import { GEOPULSE_CANARY_PROFILE, GEOPULSE_PROFILE, validateRepositoryProfile } from './repository-profile';

export type ProfileAuthority = 'internal-scheduler' | 'external-canary' | 'local-disposable-test';

export type ResolvedRepositoryProfile = {
  profile: RepositoryProfile;
  digest: string;
};

export type RepositoryProfileInstall = {
  profile: RepositoryProfile;
  authorities: readonly ProfileAuthority[];
};

export class RepositoryProfileRegistry {
  readonly #installs: ReadonlyMap<string, RepositoryProfileInstall>;

  constructor(installs: readonly RepositoryProfileInstall[]) {
    const entries = new Map<string, RepositoryProfileInstall>();
    for (const install of installs) {
      if (entries.has(install.profile.id)) throw new Error(`duplicate repository profile id: ${install.profile.id}`);
      const failures = validateRepositoryProfile(install.profile);
      if (failures.length > 0) throw new Error(`invalid repository profile ${install.profile.id}: ${failures.join('; ')}`);
      if (install.authorities.length === 0) throw new Error(`repository profile ${install.profile.id} has no authority grant`);
      entries.set(install.profile.id, structuredClone(install));
    }
    this.#installs = entries;
  }

  async resolve(args: {
    profileId: string;
    authority: ProfileAuthority;
    targetUrl: string;
    repository?: string;
  }): Promise<ResolvedRepositoryProfile | null> {
    const install = this.#installs.get(args.profileId);
    if (!install || !install.authorities.includes(args.authority)) return null;
    if (args.repository !== undefined && args.repository !== install.profile.repository) return null;
    let targetOrigin: string;
    try {
      targetOrigin = new URL(args.targetUrl).origin;
    } catch {
      return null;
    }
    if (targetOrigin !== new URL(install.profile.siteOrigin).origin) return null;
    return { profile: structuredClone(install.profile), digest: await repositoryProfileDigest(install.profile) };
  }
}

export async function repositoryProfileDigest(profile: RepositoryProfile): Promise<string> {
  const failures = validateRepositoryProfile(profile);
  if (failures.length > 0) throw new Error(`cannot digest invalid repository profile: ${failures.join('; ')}`);
  return sha256(profile);
}

export const INSTALLED_PROFILE_REGISTRY = new RepositoryProfileRegistry([
  { profile: GEOPULSE_PROFILE, authorities: ['internal-scheduler'] },
  { profile: GEOPULSE_CANARY_PROFILE, authorities: ['external-canary'] },
]);
