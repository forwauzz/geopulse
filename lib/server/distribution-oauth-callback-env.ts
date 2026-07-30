type OAuthCallbackEnvironmentKey =
  | 'X_OAUTH_CLIENT_ID'
  | 'X_OAUTH_CLIENT_SECRET'
  | 'X_OAUTH_TOKEN_URL'
  | 'LINKEDIN_OAUTH_CLIENT_ID'
  | 'LINKEDIN_OAUTH_CLIENT_SECRET'
  | 'LINKEDIN_OAUTH_TOKEN_URL'
  | 'INSTAGRAM_OAUTH_CLIENT_ID'
  | 'INSTAGRAM_OAUTH_CLIENT_SECRET'
  | 'INSTAGRAM_OAUTH_TOKEN_URL'
  | 'INSTAGRAM_GRAPH_API_BASE_URL';

type OAuthCallbackEnvironment = Partial<
  Record<OAuthCallbackEnvironmentKey, string | undefined>
>;

function resolveValue(
  key: OAuthCallbackEnvironmentKey,
  processEnvironment: OAuthCallbackEnvironment,
  workerEnvironment: OAuthCallbackEnvironment
): string | undefined {
  return processEnvironment[key]?.trim() || workerEnvironment[key]?.trim() || undefined;
}

export function resolveDistributionOAuthCallbackConfig(
  processEnvironment: OAuthCallbackEnvironment,
  workerEnvironment: OAuthCallbackEnvironment
) {
  return {
    xClientId: resolveValue('X_OAUTH_CLIENT_ID', processEnvironment, workerEnvironment),
    xClientSecret: resolveValue('X_OAUTH_CLIENT_SECRET', processEnvironment, workerEnvironment),
    xTokenUrl: resolveValue('X_OAUTH_TOKEN_URL', processEnvironment, workerEnvironment),
    linkedinClientId: resolveValue(
      'LINKEDIN_OAUTH_CLIENT_ID',
      processEnvironment,
      workerEnvironment
    ),
    linkedinClientSecret: resolveValue(
      'LINKEDIN_OAUTH_CLIENT_SECRET',
      processEnvironment,
      workerEnvironment
    ),
    linkedinTokenUrl: resolveValue(
      'LINKEDIN_OAUTH_TOKEN_URL',
      processEnvironment,
      workerEnvironment
    ),
    instagramClientId: resolveValue(
      'INSTAGRAM_OAUTH_CLIENT_ID',
      processEnvironment,
      workerEnvironment
    ),
    instagramClientSecret: resolveValue(
      'INSTAGRAM_OAUTH_CLIENT_SECRET',
      processEnvironment,
      workerEnvironment
    ),
    instagramTokenUrl: resolveValue(
      'INSTAGRAM_OAUTH_TOKEN_URL',
      processEnvironment,
      workerEnvironment
    ),
    instagramGraphBaseUrl: resolveValue(
      'INSTAGRAM_GRAPH_API_BASE_URL',
      processEnvironment,
      workerEnvironment
    ),
  };
}
