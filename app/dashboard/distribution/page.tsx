import Link from 'next/link';
import { DistributionEngineAdminControls } from '@/components/distribution-engine-admin-controls';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import { createDistributionEngineAdminData } from '@/lib/server/distribution-engine-admin-data';
import { createContentAdminData } from '@/lib/server/content-admin-data';
import { resolveDistributionEngineFlags } from '@/lib/server/distribution-engine-flags';

export const dynamic = 'force-dynamic';

function formatDateTime(value: string | null): string {
  if (!value) return '-';
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatLabel(value: string | null): string {
  if (!value) return '-';
  return value
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function statusTone(status: string): string {
  switch (status) {
    case 'connected':
    case 'approved':
    case 'published':
    case 'ready':
      return 'bg-primary/15 text-primary';
    case 'scheduled':
    case 'review':
    case 'processing':
      return 'bg-warning/20 text-on-background';
    case 'failed':
    case 'error':
    case 'revoked':
    case 'invalid':
    case 'cancelled':
      return 'bg-error/15 text-error';
    default:
      return 'bg-surface-container-high text-on-surface-variant';
  }
}

function tokenHealthLabel(account: {
  status: string;
  token_count: number;
  latest_token_expiry: string | null;
}): string {
  if (account.token_count === 0) return 'No token';
  if (account.status === 'token_expired' || account.status === 'revoked') return 'Needs attention';
  if (!account.latest_token_expiry) return 'No expiry';

  const expiresAt = new Date(account.latest_token_expiry);
  if (Number.isNaN(expiresAt.getTime())) return 'Unknown';

  const now = Date.now();
  const diffMs = expiresAt.getTime() - now;
  if (diffMs <= 0) return 'Expired';
  if (diffMs <= 1000 * 60 * 60 * 24 * 3) return 'Expiring soon';
  return 'Healthy';
}

function formatBackoffPolicy(account: {
  retry_backoff_profile: string;
  retry_backoff_multiplier: number | null;
}): string {
  const profile = formatLabel(account.retry_backoff_profile);
  if (!account.retry_backoff_multiplier) return profile;
  return `${profile} x${account.retry_backoff_multiplier.toFixed(2)}`;
}

function formatRetryDelayMs(value: number | null): string {
  if (!value || value <= 0) return '-';
  if (value < 60_000) return `${Math.round(value / 1000)}s`;
  const mins = Math.round(value / 60_000);
  return `${mins}m`;
}

function accountNextAction(account: {
  provider_name: string;
  status: string;
  token_count: number;
}): string {
  if (account.token_count === 0) return 'Save a token for this account.';
  if (account.provider_name === 'linkedin' && account.status === 'token_expired') {
    return 'Reconnect LinkedIn OAuth from the connect form above.';
  }
  if (account.status === 'token_expired' || account.status === 'revoked') {
    return 'Reconnect account OAuth from the connect form above.';
  }
  return '-';
}

function readErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (!error || typeof error !== 'object') return 'Unknown error';

  const message =
    typeof (error as { message?: unknown }).message === 'string'
      ? (error as { message: string }).message
      : null;
  const details =
    typeof (error as { details?: unknown }).details === 'string'
      ? (error as { details: string }).details
      : null;
  const hint =
    typeof (error as { hint?: unknown }).hint === 'string'
      ? (error as { hint: string }).hint
      : null;

  const parts = [message, details, hint].filter(
    (part): part is string => typeof part === 'string' && part.trim().length > 0
  );
  if (parts.length === 0) return 'Unknown error';
  return parts.join(' | ');
}

export default async function DistributionAdminPage(props: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const adminContext = await loadAdminPageContext('/dashboard/distribution');
  if (!adminContext.ok) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <p className="text-error">{adminContext.message}</p>
      </main>
    );
  }

  const flags = resolveDistributionEngineFlags(adminContext.env);
  const resolvedSearchParams = (await props.searchParams) ?? {};
  const oauthOutcome = Array.isArray(resolvedSearchParams['oauth'])
    ? resolvedSearchParams['oauth'][0] ?? null
    : resolvedSearchParams['oauth'] ?? null;
  const oauthProvider = Array.isArray(resolvedSearchParams['provider'])
    ? resolvedSearchParams['provider'][0] ?? null
    : resolvedSearchParams['provider'] ?? null;
  if (!flags.uiEnabled) {
    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="font-headline text-3xl font-bold text-on-background">Distribution engine</h1>
        <p className="mt-4 font-body text-on-surface-variant">
          The distribution-engine admin surface is feature-flagged off for this environment.
        </p>
        <div className="mt-6 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 font-body text-sm text-on-surface-variant">
          Set <code>DISTRIBUTION_ENGINE_UI_ENABLED=true</code> to expose the read-only shell, and{' '}
          <code>DISTRIBUTION_ENGINE_WRITE_ENABLED=true</code> to expose writable controls.
        </div>
      </main>
    );
  }

  const adminData = createDistributionEngineAdminData(adminContext.adminDb);
  const contentAdminData = createContentAdminData(adminContext.adminDb);

  try {
    const [overview, contentItems] = await Promise.all([
      adminData.getOverview(),
      contentAdminData.getRecentContentItems(),
    ]);
    const connectedAccounts = overview.accounts.filter((account) => account.status === 'connected').length;
    const pendingJobs = overview.jobs.filter((job) =>
      ['draft', 'queued', 'scheduled', 'processing'].includes(job.status)
    ).length;
    const assetsWithMedia = overview.assets.filter((asset) => asset.media_count > 0).length;

    return (
      <main className="mx-auto max-w-6xl px-6 py-16">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-label text-sm font-semibold uppercase tracking-widest text-primary">
              Admin
            </p>
            <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">
              Distribution engine
            </h1>
            <p className="mt-1 max-w-2xl font-body text-on-surface-variant">
              Read-only control shell for the generalized distribution model: connected accounts,
              typed assets, queued jobs, and the first bounded dispatch runtime.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href="/dashboard/content"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
            >
              Content machine
            </Link>
            <Link
              href="/dashboard/logs"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
            >
              Logs
            </Link>
            <Link
              href="/dashboard"
              className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-2 font-body text-sm font-medium text-on-background transition hover:bg-surface-container-high"
            >
              Account
            </Link>
          </div>
        </div>

        <section className="mt-10 grid gap-4 md:grid-cols-4">
          <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
            <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
              Accounts
            </p>
            <p className="mt-1 font-headline text-2xl font-bold text-on-background">
              {overview.accounts.length}
            </p>
          </div>
          <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
            <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
              Connected
            </p>
            <p className="mt-1 font-headline text-2xl font-bold text-on-background">
              {connectedAccounts}
            </p>
          </div>
          <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
            <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
              Assets
            </p>
            <p className="mt-1 font-headline text-2xl font-bold text-on-background">
              {overview.assets.length}
            </p>
            <p className="mt-2 font-body text-xs text-on-surface-variant">
              {assetsWithMedia} with media attached
            </p>
          </div>
          <div className="rounded-xl bg-surface-container-lowest px-4 py-4 shadow-float">
            <p className="font-label text-xs uppercase tracking-widest text-on-surface-variant">
              Pending jobs
            </p>
            <p className="mt-1 font-headline text-2xl font-bold text-on-background">
              {pendingJobs}
            </p>
          </div>
        </section>

        <div className="mt-4 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 font-body text-sm text-on-surface-variant">
          <strong className="text-on-background">Current scope:</strong> this page is intentionally
          gated. The read model is behind <code>DISTRIBUTION_ENGINE_UI_ENABLED</code>, and writable
          controls are separately behind <code>DISTRIBUTION_ENGINE_WRITE_ENABLED</code>. Social OAuth
          connect controls are behind <code>DISTRIBUTION_ENGINE_SOCIAL_OAUTH_ENABLED</code>.
          Background cron dispatch is separately controlled by{' '}
          <code>DISTRIBUTION_ENGINE_BACKGROUND_ENABLED</code>.
        </div>

        {oauthOutcome ? (
          <div className="mt-4 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 font-body text-sm text-on-surface-variant">
            <strong className="text-on-background">OAuth result:</strong>{' '}
            {oauthProvider ? `${oauthProvider} - ` : ''}
            {oauthOutcome.replaceAll('_', ' ')}
          </div>
        ) : null}

        {flags.writeEnabled ? (
          <DistributionEngineAdminControls
            contentOptions={contentItems.map((item) => ({
              id: item.id,
              contentId: item.content_id,
              title: item.title,
            }))}
            accountOptions={overview.accounts.map((account) => ({
              id: account.id,
              accountId: account.account_id,
              label: account.account_label,
              providerName: account.provider_name,
            }))}
            assetOptions={overview.assets.map((asset) => ({
              id: asset.id,
              assetId: asset.asset_id,
              label: asset.title?.trim() ? `${asset.title} (${asset.asset_id})` : asset.asset_id,
            }))}
            socialOauthEnabled={flags.socialOauthEnabled}
          />
        ) : (
          <div className="mt-6 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 font-body text-sm text-on-surface-variant">
            <strong className="text-on-background">Write controls disabled:</strong> the read-only
            shell is live, but account/asset/job forms stay hidden until{' '}
            <code>DISTRIBUTION_ENGINE_WRITE_ENABLED=true</code>.
          </div>
        )}

        <section className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-headline text-xl font-bold text-on-background">
                Connected accounts
              </h2>
              <p className="mt-1 max-w-3xl font-body text-sm text-on-surface-variant">
                External publishing identities and token state for future platform connections.
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl bg-surface-container-lowest shadow-float">
            <table className="min-w-[1240px] w-full border-collapse text-left font-body text-sm">
              <thead className="bg-surface-container-low">
                <tr className="text-on-surface-variant">
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Provider</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Backoff policy</th>
                  <th className="px-4 py-3 text-right">Tokens</th>
                  <th className="px-4 py-3">Token health</th>
                  <th className="px-4 py-3">Next action</th>
                  <th className="px-4 py-3">Latest expiry</th>
                  <th className="px-4 py-3">Verified</th>
                  <th className="px-4 py-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {overview.accounts.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-on-surface-variant" colSpan={10}>
                      No distribution accounts stored yet. The schema and repository are present,
                      but no account-connection flow has been built on top of them yet.
                    </td>
                  </tr>
                ) : (
                  overview.accounts.map((account) => (
                    <tr key={account.id} className="border-t border-outline-variant/10 align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium text-on-background">{account.account_label}</div>
                        <div className="mt-1 text-xs text-on-surface-variant">
                          {account.account_id}
                        </div>
                        <div className="mt-1 text-xs text-on-surface-variant">
                          External: {account.external_account_id ?? '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3">{formatLabel(account.provider_name)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold ${statusTone(account.status)}`}
                        >
                          {formatLabel(account.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">{formatBackoffPolicy(account)}</td>
                      <td className="px-4 py-3 text-right">{account.token_count}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold ${statusTone(
                            tokenHealthLabel(account) === 'Healthy'
                              ? 'connected'
                              : tokenHealthLabel(account) === 'Expiring soon'
                                ? 'scheduled'
                                : tokenHealthLabel(account) === 'No expiry'
                                  ? 'review'
                                  : 'error'
                          )}`}
                        >
                          {tokenHealthLabel(account)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-on-surface-variant">
                        {accountNextAction(account)}
                      </td>
                      <td className="px-4 py-3">{formatDateTime(account.latest_token_expiry)}</td>
                      <td className="px-4 py-3">{formatDateTime(account.last_verified_at)}</td>
                      <td className="px-4 py-3">{formatDateTime(account.updated_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-headline text-xl font-bold text-on-background">Typed assets</h2>
              <p className="mt-1 max-w-3xl font-body text-sm text-on-surface-variant">
                Future downstream posts derived from canonical content or benchmark insight records.
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl bg-surface-container-lowest shadow-float">
            <table className="min-w-[1280px] w-full border-collapse text-left font-body text-sm">
              <thead className="bg-surface-container-low">
                <tr className="text-on-surface-variant">
                  <th className="px-4 py-3">Asset</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Family</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Media</th>
                  <th className="px-4 py-3 text-right">Ready media</th>
                  <th className="px-4 py-3">Latest media URL</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {overview.assets.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-on-surface-variant" colSpan={9}>
                      No generalized distribution assets exist yet.
                    </td>
                  </tr>
                ) : (
                  overview.assets.map((asset) => (
                    <tr key={asset.id} className="border-t border-outline-variant/10 align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium text-on-background">{asset.title ?? '-'}</div>
                        <div className="mt-1 text-xs text-on-surface-variant">{asset.asset_id}</div>
                      </td>
                      <td className="px-4 py-3">{formatLabel(asset.asset_type)}</td>
                      <td className="px-4 py-3">{formatLabel(asset.provider_family)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold ${statusTone(asset.status)}`}
                        >
                          {formatLabel(asset.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">{asset.media_count}</td>
                      <td className="px-4 py-3 text-right">{asset.ready_media_count}</td>
                      <td className="px-4 py-3 text-on-surface-variant">
                        {asset.latest_media_storage_url ? (
                          <a
                            href={asset.latest_media_storage_url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline decoration-dotted underline-offset-2"
                          >
                            preview
                          </a>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div>{formatLabel(asset.source_type)}</div>
                        <div className="mt-1 text-xs text-on-surface-variant">
                          {asset.content_item_id ?? asset.source_key ?? '-'}
                        </div>
                      </td>
                      <td className="px-4 py-3">{formatDateTime(asset.updated_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-12">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-headline text-xl font-bold text-on-background">Delivery jobs</h2>
              <p className="mt-1 max-w-3xl font-body text-sm text-on-surface-variant">
                Queue-ready publish records with dispatch state and attempt history summary.
              </p>
            </div>
          </div>

          <div className="mt-4 overflow-x-auto rounded-xl bg-surface-container-lowest shadow-float">
            <table className="min-w-[1280px] w-full border-collapse text-left font-body text-sm">
              <thead className="bg-surface-container-low">
                <tr className="text-on-surface-variant">
                  <th className="px-4 py-3">Job</th>
                  <th className="px-4 py-3">Mode</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Scheduled</th>
                  <th className="px-4 py-3">Next retry</th>
                  <th className="px-4 py-3">Retry delay</th>
                  <th className="px-4 py-3 text-right">Attempts</th>
                  <th className="px-4 py-3">Latest error</th>
                  <th className="px-4 py-3">Updated</th>
                </tr>
              </thead>
              <tbody>
                {overview.jobs.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-on-surface-variant" colSpan={9}>
                      No generalized distribution jobs exist yet.
                    </td>
                  </tr>
                ) : (
                  overview.jobs.map((job) => (
                    <tr key={job.id} className="border-t border-outline-variant/10 align-top">
                      <td className="px-4 py-3">
                        <div className="font-medium text-on-background">{job.job_id}</div>
                        <div className="mt-1 text-xs text-on-surface-variant">
                          Asset: {job.distribution_asset_id}
                        </div>
                        <div className="mt-1 text-xs text-on-surface-variant">
                          Account: {job.distribution_account_id}
                        </div>
                      </td>
                      <td className="px-4 py-3">{formatLabel(job.publish_mode)}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-semibold ${statusTone(job.status)}`}
                        >
                          {formatLabel(job.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">{formatDateTime(job.scheduled_for)}</td>
                      <td className="px-4 py-3">{formatDateTime(job.latest_retry_scheduled_for)}</td>
                      <td className="px-4 py-3">{formatRetryDelayMs(job.latest_retry_after_ms)}</td>
                      <td className="px-4 py-3 text-right">{job.attempt_count}</td>
                      <td className="px-4 py-3 text-on-surface-variant">
                        {job.latest_attempt_error ?? job.last_error ?? '-'}
                      </td>
                      <td className="px-4 py-3">{formatDateTime(job.updated_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    );
  } catch (error) {
    const message = readErrorMessage(error);
    const missingTable =
      /distribution_accounts|distribution_account_tokens|distribution_assets|distribution_asset_media|distribution_jobs|distribution_job_attempts|relation .* does not exist|column .* does not exist|schema cache/i.test(
        message
      );

    return (
      <main className="mx-auto max-w-5xl px-6 py-16">
        <h1 className="font-headline text-3xl font-bold text-on-background">Distribution engine</h1>
        <p className="mt-4 text-error">
          Could not load the distribution-engine admin shell.
          <br />
          {message}
        </p>
        {missingTable ? (
          <div className="mt-6 rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 font-body text-sm text-on-surface-variant">
            Your database is missing the generalized distribution-engine migration. Run{' '}
            <code>npm run db:migrate</code> or apply{' '}
            <code>supabase/migrations/020_distribution_engine_foundation.sql</code>.
          </div>
        ) : null}
      </main>
    );
  }
}
