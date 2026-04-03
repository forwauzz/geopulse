import type { ScanApiEnv } from '@/lib/server/cf-env';

function parseBooleanFlag(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

export type DistributionEngineFlags = {
  readonly uiEnabled: boolean;
  readonly writeEnabled: boolean;
  readonly socialOauthEnabled: boolean;
};

export function resolveDistributionEngineFlags(env: Pick<
  ScanApiEnv,
  | 'DISTRIBUTION_ENGINE_UI_ENABLED'
  | 'DISTRIBUTION_ENGINE_WRITE_ENABLED'
  | 'DISTRIBUTION_ENGINE_SOCIAL_OAUTH_ENABLED'
>): DistributionEngineFlags {
  return {
    uiEnabled: parseBooleanFlag(env.DISTRIBUTION_ENGINE_UI_ENABLED),
    writeEnabled: parseBooleanFlag(env.DISTRIBUTION_ENGINE_WRITE_ENABLED),
    socialOauthEnabled: parseBooleanFlag(env.DISTRIBUTION_ENGINE_SOCIAL_OAUTH_ENABLED),
  };
}
