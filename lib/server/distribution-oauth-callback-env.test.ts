import { describe, expect, it } from 'vitest';
import { resolveDistributionOAuthCallbackConfig } from './distribution-oauth-callback-env';

describe('resolveDistributionOAuthCallbackConfig', () => {
  it('uses Worker-bound OAuth credentials when process.env is empty', () => {
    expect(
      resolveDistributionOAuthCallbackConfig(
        {},
        {
          X_OAUTH_CLIENT_ID: ' worker-x-id ',
          X_OAUTH_CLIENT_SECRET: ' worker-x-secret ',
          X_OAUTH_TOKEN_URL: ' https://api.x.com/2/oauth2/token ',
          LINKEDIN_OAUTH_CLIENT_ID: 'worker-linkedin-id',
          LINKEDIN_OAUTH_CLIENT_SECRET: 'worker-linkedin-secret',
          INSTAGRAM_OAUTH_CLIENT_ID: 'worker-instagram-id',
          INSTAGRAM_OAUTH_CLIENT_SECRET: 'worker-instagram-secret',
        }
      )
    ).toMatchObject({
      xClientId: 'worker-x-id',
      xClientSecret: 'worker-x-secret',
      xTokenUrl: 'https://api.x.com/2/oauth2/token',
      linkedinClientId: 'worker-linkedin-id',
      linkedinClientSecret: 'worker-linkedin-secret',
      instagramClientId: 'worker-instagram-id',
      instagramClientSecret: 'worker-instagram-secret',
    });
  });

  it('prefers non-blank process.env values and falls back for blank values', () => {
    expect(
      resolveDistributionOAuthCallbackConfig(
        {
          X_OAUTH_CLIENT_ID: 'process-x-id',
          X_OAUTH_CLIENT_SECRET: '   ',
        },
        {
          X_OAUTH_CLIENT_ID: 'worker-x-id',
          X_OAUTH_CLIENT_SECRET: 'worker-x-secret',
        }
      )
    ).toMatchObject({
      xClientId: 'process-x-id',
      xClientSecret: 'worker-x-secret',
    });
  });
});
