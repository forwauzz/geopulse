'use client';

import { useActionState } from 'react';
import {
  createDistributionAccount,
  createDistributionAsset,
  saveDistributionAssetMedia,
  dispatchDueDistributionJobs,
  createDistributionJob,
  seedSocialDistributionJob,
  startSocialDistributionOauthConnect,
  saveDistributionAccountToken,
  type DistributionEngineActionState,
} from '@/app/dashboard/distribution/actions';

const initialState: DistributionEngineActionState | null = null;

type ContentOption = {
  readonly id: string;
  readonly contentId: string;
  readonly title: string;
};

type AccountOption = {
  readonly id: string;
  readonly accountId: string;
  readonly label: string;
  readonly providerName: string;
};

type AssetOption = {
  readonly id: string;
  readonly assetId: string;
  readonly label: string;
};

type Props = {
  readonly contentOptions: ContentOption[];
  readonly accountOptions: AccountOption[];
  readonly assetOptions: AssetOption[];
  readonly socialOauthEnabled: boolean;
};

export function DistributionEngineAdminControls({
  contentOptions,
  accountOptions,
  assetOptions,
  socialOauthEnabled,
}: Props) {
  const [accountState, accountAction, accountPending] = useActionState(
    createDistributionAccount,
    initialState
  );
  const [assetState, assetAction, assetPending] = useActionState(
    createDistributionAsset,
    initialState
  );
  const [tokenState, tokenAction, tokenPending] = useActionState(
    saveDistributionAccountToken,
    initialState
  );
  const [jobState, jobAction, jobPending] = useActionState(createDistributionJob, initialState);
  const [mediaState, mediaAction, mediaPending] = useActionState(
    saveDistributionAssetMedia,
    initialState
  );
  const [socialSeedState, socialSeedAction, socialSeedPending] = useActionState(
    seedSocialDistributionJob,
    initialState
  );
  const [dispatchState, dispatchAction, dispatchPending] = useActionState(
    dispatchDueDistributionJobs,
    initialState
  );

  const socialAccountOptions = accountOptions.filter(
    (account) => account.providerName === 'x' || account.providerName === 'linkedin'
  );

  return (
    <section className="mt-10">
      <form action={dispatchAction} className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
        <h2 className="font-headline text-lg font-semibold text-on-background">Dispatch due jobs</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Run the bounded first-pass dispatcher against due draft or scheduled jobs from admin.
          The dedicated queue consumer exists now; this button remains the direct manual override.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={dispatchPending}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary disabled:opacity-60"
          >
            {dispatchPending ? 'Dispatching...' : 'Dispatch due jobs'}
          </button>
          {dispatchState ? (
            <p className={`text-sm ${dispatchState.ok ? 'text-primary' : 'text-error'}`}>
              {dispatchState.message}
            </p>
          ) : null}
        </div>
      </form>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <form action={socialSeedAction} className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
        <h2 className="font-headline text-lg font-semibold text-on-background">
          Seed social asset + job
        </h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Quick operator path for social testing: creates one approved social asset and one linked
          distribution job from a canonical content item. Requires a connected account and at least
          one stored token row.
        </p>
        <div className="mt-4 grid gap-4">
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Social account</span>
            <select
              name="distributionAccountId"
              required
              defaultValue=""
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            >
              <option value="">Choose x/linkedin account</option>
              {socialAccountOptions.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label} ({account.accountId})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Content item</span>
            <select
              name="contentItemId"
              required
              defaultValue=""
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            >
              <option value="">Choose a canonical content item</option>
              {contentOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} ({item.contentId})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Asset type</span>
            <select
              name="assetType"
              defaultValue="link_post"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            >
              <option value="link_post">link_post</option>
              <option value="thread_post">thread_post</option>
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Publish mode</span>
            <select
              name="publishMode"
              defaultValue="publish_now"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            >
              <option value="publish_now">publish_now</option>
              <option value="draft">draft</option>
              <option value="scheduled">scheduled</option>
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Scheduled for (optional)</span>
            <input
              name="scheduledFor"
              type="datetime-local"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={socialSeedPending}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary disabled:opacity-60"
          >
            {socialSeedPending ? 'Seeding...' : 'Seed social asset + job'}
          </button>
          {socialSeedState ? (
            <p className={`text-sm ${socialSeedState.ok ? 'text-primary' : 'text-error'}`}>
              {socialSeedState.message}
            </p>
          ) : null}
        </div>
      </form>

      {socialOauthEnabled ? (
        <form
          action={startSocialDistributionOauthConnect}
          className="rounded-xl bg-surface-container-lowest p-5 shadow-float"
        >
          <h2 className="font-headline text-lg font-semibold text-on-background">
            Connect social account (OAuth)
          </h2>
          <p className="mt-1 text-sm text-on-surface-variant">
            Start provider OAuth for one stored `x`/`linkedin` account. On callback, token rows and
            account verification metadata are updated automatically.
          </p>
          <div className="mt-4 grid gap-4">
            <label className="flex flex-col gap-2 text-sm text-on-background">
              <span className="font-medium">Social account</span>
              <select
                name="distributionAccountId"
                required
                defaultValue=""
                className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
              >
                <option value="">Choose x/linkedin account</option>
                {socialAccountOptions.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.label} ({account.accountId})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              type="submit"
              className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary"
            >
              Connect selected social account
            </button>
          </div>
        </form>
      ) : (
        <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low p-5 text-sm text-on-surface-variant">
          Social OAuth connect is feature-flagged off. Enable
          <code className="mx-1">DISTRIBUTION_ENGINE_SOCIAL_OAUTH_ENABLED=true</code>
          to expose provider connect controls.
        </div>
      )}

      <form action={accountAction} className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
        <h2 className="font-headline text-lg font-semibold text-on-background">Save account</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Create or update one connected distribution-account record.
        </p>
        <div className="mt-4 grid gap-4">
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Account id</span>
            <input
              name="accountId"
              required
              placeholder="linkedin_founder"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Provider</span>
            <select
              name="providerName"
              defaultValue="linkedin"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            >
              {[
                'buttondown',
                'kit',
                'ghost',
                'beehiiv',
                'mailchimp',
                'x',
                'linkedin',
                'threads',
                'reddit',
                'instagram',
                'facebook',
                'youtube',
                'tiktok',
                'custom',
              ].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Label</span>
            <input
              name="accountLabel"
              required
              placeholder="Founder LinkedIn"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">External account id</span>
            <input
              name="externalAccountId"
              placeholder="urn:li:person:123"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Default audience id</span>
            <input
              name="defaultAudienceId"
              placeholder="newsletter-main"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Status</span>
            <select
              name="status"
              defaultValue="draft"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            >
              {['draft', 'connected', 'token_expired', 'revoked', 'disconnected', 'error'].map(
                (value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                )
              )}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Retry backoff profile</span>
            <select
              name="retryBackoffProfile"
              defaultValue="default"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            >
              <option value="default">default</option>
              <option value="aggressive">aggressive</option>
              <option value="conservative">conservative</option>
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Retry backoff multiplier</span>
            <input
              name="retryBackoffMultiplier"
              type="number"
              step="0.1"
              min="0.1"
              max="5"
              placeholder="1.0"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={accountPending}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary disabled:opacity-60"
          >
            {accountPending ? 'Saving...' : 'Save account'}
          </button>
          {accountState ? (
            <p className={`text-sm ${accountState.ok ? 'text-primary' : 'text-error'}`}>
              {accountState.message}
            </p>
          ) : null}
        </div>
      </form>

      <form action={tokenAction} className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
        <h2 className="font-headline text-lg font-semibold text-on-background">Save token</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Store one token row for an existing account and keep the account connection state in sync.
        </p>
        <div className="mt-4 grid gap-4">
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Account</span>
            <select
              name="distributionAccountId"
              required
              defaultValue=""
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            >
              <option value="">Choose an account</option>
              {accountOptions.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label} ({account.accountId})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Token type</span>
            <select
              name="tokenType"
              defaultValue="oauth"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            >
              {['oauth', 'api_key', 'bearer_token', 'session_token'].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Access token</span>
            <textarea
              name="accessTokenEncrypted"
              rows={3}
              placeholder="provider access token or encrypted placeholder"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Refresh token</span>
            <textarea
              name="refreshTokenEncrypted"
              rows={2}
              placeholder="provider refresh token or encrypted placeholder"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Scopes</span>
            <input
              name="scopesCsv"
              placeholder="write:posts,read:profile"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Expires at</span>
            <input
              name="expiresAt"
              type="datetime-local"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Account status after save</span>
            <select
              name="accountStatus"
              defaultValue="connected"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            >
              {['draft', 'connected', 'token_expired', 'revoked', 'disconnected', 'error'].map(
                (value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                )
              )}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={tokenPending}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary disabled:opacity-60"
          >
            {tokenPending ? 'Saving...' : 'Save token'}
          </button>
          {tokenState ? (
            <p className={`text-sm ${tokenState.ok ? 'text-primary' : 'text-error'}`}>
              {tokenState.message}
            </p>
          ) : null}
        </div>
      </form>

      <form action={assetAction} className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
        <h2 className="font-headline text-lg font-semibold text-on-background">Seed asset</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Create one typed downstream asset record from canonical content or another source key.
        </p>
        <div className="mt-4 grid gap-4">
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Asset id</span>
            <input
              name="assetId"
              required
              placeholder="linkedin_thread_launch_1"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Source type</span>
            <select
              name="sourceType"
              defaultValue="content_item"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            >
              <option value="content_item">content_item</option>
              <option value="benchmark_insight">benchmark_insight</option>
              <option value="manual">manual</option>
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Canonical content item</span>
            <select
              name="contentItemId"
              defaultValue=""
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            >
              <option value="">Choose a content item</option>
              {contentOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} ({item.contentId})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Non-content source key</span>
            <input
              name="sourceKey"
              placeholder="benchmark-law-firms-window-1"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Asset type</span>
            <select
              name="assetType"
              defaultValue="link_post"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            >
              {[
                'newsletter_email',
                'link_post',
                'thread_post',
                'single_image_post',
                'carousel_post',
                'short_video_post',
                'long_video_post',
              ].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Provider family</span>
            <select
              name="providerFamily"
              defaultValue="linkedin"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            >
              {[
                'newsletter',
                'x',
                'linkedin',
                'threads',
                'reddit',
                'instagram',
                'facebook',
                'youtube',
                'tiktok',
                'generic',
              ].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Title</span>
            <input
              name="title"
              placeholder="Why schema is necessary but not sufficient"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Status</span>
            <select
              name="status"
              defaultValue="draft"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            >
              {['draft', 'review', 'approved', 'scheduled', 'published', 'failed', 'archived'].map(
                (value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                )
              )}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">CTA URL</span>
            <input
              name="ctaUrl"
              placeholder="https://getgeopulse.com"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Body markdown</span>
            <textarea
              name="bodyMarkdown"
              rows={4}
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={assetPending}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary disabled:opacity-60"
          >
            {assetPending ? 'Saving...' : 'Save asset'}
          </button>
          {assetState ? (
            <p className={`text-sm ${assetState.ok ? 'text-primary' : 'text-error'}`}>
              {assetState.message}
            </p>
          ) : null}
        </div>
      </form>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
      <form action={jobAction} className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
        <h2 className="font-headline text-lg font-semibold text-on-background">Create job</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Create a draft, scheduled, or publish-now job against an existing account and asset.
        </p>
        <div className="mt-4 grid gap-4">
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Job id</span>
            <input
              name="jobId"
              required
              placeholder="linkedin_launch_batch_1"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Asset</span>
            <select
              name="distributionAssetId"
              required
              defaultValue=""
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            >
              <option value="">Choose an asset</option>
              {assetOptions.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Account</span>
            <select
              name="distributionAccountId"
              required
              defaultValue=""
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            >
              <option value="">Choose an account</option>
              {accountOptions.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.label} ({account.accountId})
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Publish mode</span>
            <select
              name="publishMode"
              defaultValue="draft"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            >
              <option value="draft">draft</option>
              <option value="scheduled">scheduled</option>
              <option value="publish_now">publish_now</option>
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Scheduled for</span>
            <input
              name="scheduledFor"
              type="datetime-local"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={jobPending}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary disabled:opacity-60"
          >
            {jobPending ? 'Saving...' : 'Create job'}
          </button>
          {jobState ? (
            <p className={`text-sm ${jobState.ok ? 'text-primary' : 'text-error'}`}>
              {jobState.message}
            </p>
          ) : null}
        </div>
      </form>

      <form action={mediaAction} className="rounded-xl bg-surface-container-lowest p-5 shadow-float">
        <h2 className="font-headline text-lg font-semibold text-on-background">Save asset media</h2>
        <p className="mt-1 text-sm text-on-surface-variant">
          Replace all media rows for one asset. Use newline or comma-separated URLs for quick seeding.
        </p>
        <div className="mt-4 grid gap-4">
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Asset</span>
            <select
              name="distributionAssetId"
              required
              defaultValue=""
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            >
              <option value="">Choose an asset</option>
              {assetOptions.map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Media kind</span>
            <select
              name="mediaKind"
              defaultValue="image"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            >
              {['image', 'carousel_slide', 'video', 'thumbnail', 'document', 'audio'].map(
                (value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                )
              )}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Provider ready status</span>
            <select
              name="providerReadyStatus"
              defaultValue="ready"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            >
              {['pending', 'ready', 'uploaded', 'invalid', 'failed'].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Storage URLs (one per line)</span>
            <textarea
              name="storageUrlsText"
              rows={4}
              required
              placeholder="https://r2.dev/media-a.png&#10;https://r2.dev/media-b.png"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">MIME type (optional)</span>
            <input
              name="mimeType"
              placeholder="image/png"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Alt text (optional)</span>
            <input
              name="altText"
              placeholder="Accessible description"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-on-background">
            <span className="font-medium">Caption (optional)</span>
            <input
              name="caption"
              placeholder="Short media caption"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-3 py-2"
            />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={mediaPending}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary disabled:opacity-60"
          >
            {mediaPending ? 'Saving...' : 'Save media'}
          </button>
          {mediaState ? (
            <p className={`text-sm ${mediaState.ok ? 'text-primary' : 'text-error'}`}>
              {mediaState.message}
            </p>
          ) : null}
        </div>
      </form>
      </div>
    </section>
  );
}

