import type Stripe from 'stripe';
import type { PaymentApiEnv } from '@/lib/server/cf-env';
import { resolveStartupRolloutFlagsFromMetadata } from '@/lib/server/startup-rollout-flags';
import { ensureDeepAuditJobQueued } from '@/lib/server/stripe/ensure-deep-audit-job-queued';
import { structuredError, structuredLog } from '@/lib/server/structured-log';

type SupabaseLike = {
  from(table: string): any;
};

type StartupSlackScheduleConfig = {
  readonly intervalDays: number;
  readonly workspaceBatchLimit: number;
};

type StartupSlackScheduleDependencies = {
  readonly now?: () => Date;
  readonly ensureDeepAuditJobQueued?: typeof ensureDeepAuditJobQueued;
  readonly structuredLog?: typeof structuredLog;
  readonly structuredError?: typeof structuredError;
};

export type StartupSlackScheduleSummary = {
  readonly status: 'disabled' | 'completed';
  readonly examinedWorkspaces: number;
  readonly queued: number;
  readonly skipped: number;
  readonly failed: number;
};

function parsePositiveInt(value: unknown, fallbackValue: number, maxValue: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(1, Math.min(maxValue, Math.trunc(value)));
  }
  if (typeof value !== 'string') return fallbackValue;
  const parsed = Number.parseInt(value.trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackValue;
  return Math.max(1, Math.min(maxValue, parsed));
}

function isValidScheduleDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidScheduleTime(value: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function getDatePartsInTimeZone(now: Date, timeZone: string): { readonly date: string; readonly time: string } {
  const dateFormatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const timeFormatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const dateParts = dateFormatter.formatToParts(now);
  const timeParts = timeFormatter.formatToParts(now);
  const year = dateParts.find((part) => part.type === 'year')?.value ?? '0000';
  const month = dateParts.find((part) => part.type === 'month')?.value ?? '00';
  const day = dateParts.find((part) => part.type === 'day')?.value ?? '00';
  const hour = timeParts.find((part) => part.type === 'hour')?.value ?? '00';
  const minute = timeParts.find((part) => part.type === 'minute')?.value ?? '00';
  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
  };
}

function isScheduleWindowReached(args: {
  readonly now: Date;
  readonly scheduleDate: string | null;
  readonly scheduleTime: string | null;
  readonly scheduleTimezone: string | null;
}): boolean {
  if (!args.scheduleDate && !args.scheduleTime && !args.scheduleTimezone) return true;

  const timeZone = args.scheduleTimezone && isValidTimeZone(args.scheduleTimezone) ? args.scheduleTimezone : 'UTC';
  const current = getDatePartsInTimeZone(args.now, timeZone);
  const anchorDate = args.scheduleDate && isValidScheduleDate(args.scheduleDate) ? args.scheduleDate : current.date;
  const anchorTime = args.scheduleTime && isValidScheduleTime(args.scheduleTime) ? args.scheduleTime : null;

  if (current.date < anchorDate) return false;
  if (current.date === anchorDate && anchorTime && current.time < anchorTime) return false;
  return true;
}

function resolveStartupSlackScheduleConfig(env: PaymentApiEnv): StartupSlackScheduleConfig {
  const raw = env as unknown as Record<string, unknown>;
  return {
    intervalDays: parsePositiveInt(raw['STARTUP_SLACK_AUTO_POST_INTERVAL_DAYS'], 30, 180),
    workspaceBatchLimit: parsePositiveInt(raw['STARTUP_SLACK_AUTO_POST_BATCH_LIMIT'], 20, 200),
  };
}

function toSiteUrl(primaryDomain: string | null, canonicalDomain: string | null): string | null {
  const raw = (canonicalDomain ?? primaryDomain ?? '').trim();
  if (!raw) return null;
  const withScheme = /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const url = new URL(withScheme);
    url.hash = '';
    url.search = '';
    if (!url.pathname || url.pathname === '') url.pathname = '/';
    return url.toString();
  } catch {
    return null;
  }
}

function toDomain(siteUrl: string): string {
  return new URL(siteUrl).hostname.trim().toLowerCase().replace(/\.$/, '');
}

function isDue(lastReportCreatedAt: string | null, now: Date, intervalDays: number): boolean {
  if (!lastReportCreatedAt) return true;
  const timestamp = new Date(lastReportCreatedAt).getTime();
  if (!Number.isFinite(timestamp)) return true;
  const cutoff = now.getTime() - intervalDays * 24 * 60 * 60 * 1000;
  return timestamp <= cutoff;
}

async function resolveWorkspaceRecipientEmail(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
}): Promise<string | null> {
  const { data: members, error: membersError } = await args.supabase
    .from('startup_workspace_users')
    .select('user_id,role')
    .eq('startup_workspace_id', args.startupWorkspaceId)
    .eq('status', 'active');
  if (membersError) throw membersError;

  const rows = (members ?? []) as Array<{ user_id: string | null; role: string | null }>;
  const byRole = new Map<string, string[]>();
  for (const row of rows) {
    const userId = typeof row.user_id === 'string' ? row.user_id : '';
    const role = typeof row.role === 'string' ? row.role : 'member';
    if (!userId) continue;
    const existing = byRole.get(role) ?? [];
    existing.push(userId);
    byRole.set(role, existing);
  }

  const orderedUserIds = [
    ...(byRole.get('founder') ?? []),
    ...(byRole.get('admin') ?? []),
    ...(byRole.get('member') ?? []),
    ...(byRole.get('viewer') ?? []),
  ];
  if (orderedUserIds.length === 0) return null;

  const { data: users, error: usersError } = await args.supabase
    .from('users')
    .select('id,email')
    .in('id', orderedUserIds);
  if (usersError) throw usersError;

  const emailByUserId = new Map<string, string>();
  for (const user of (users ?? []) as Array<{ id: string | null; email: string | null }>) {
    const id = typeof user.id === 'string' ? user.id : '';
    const email = typeof user.email === 'string' ? user.email.trim().toLowerCase() : '';
    if (!id || !email) continue;
    emailByUserId.set(id, email);
  }

  for (const userId of orderedUserIds) {
    const email = emailByUserId.get(userId);
    if (email) return email;
  }

  return null;
}

export async function runScheduledStartupSlackAutoPost(args: {
  readonly supabase: SupabaseLike;
  readonly env: PaymentApiEnv;
  readonly deps?: StartupSlackScheduleDependencies;
}): Promise<StartupSlackScheduleSummary> {
  const log = args.deps?.structuredLog ?? structuredLog;
  const logError = args.deps?.structuredError ?? structuredError;
  const now = (args.deps?.now ?? (() => new Date()))();
  const ensureQueued = args.deps?.ensureDeepAuditJobQueued ?? ensureDeepAuditJobQueued;
  const config = resolveStartupSlackScheduleConfig(args.env);

  if (!args.env.SCAN_QUEUE) {
    log('startup_slack_schedule_skipped', { reason: 'scan_queue_missing' }, 'info');
    return {
      status: 'disabled',
      examinedWorkspaces: 0,
      queued: 0,
      skipped: 0,
      failed: 0,
    };
  }

  const { data: workspaces, error: workspacesError } = await args.supabase
    .from('startup_workspaces')
    .select('id,primary_domain,canonical_domain,metadata,status')
    .in('status', ['pilot', 'active'])
    .order('updated_at', { ascending: false })
    .limit(config.workspaceBatchLimit);
  if (workspacesError) throw workspacesError;

  let examinedWorkspaces = 0;
  let queued = 0;
  let skipped = 0;
  let failed = 0;

  for (const workspace of (workspaces ?? []) as Array<{
    id: string;
    primary_domain: string | null;
    canonical_domain: string | null;
    metadata: Record<string, unknown> | null;
  }>) {
    examinedWorkspaces += 1;

    try {
      const rollout = resolveStartupRolloutFlagsFromMetadata({
        metadata: workspace.metadata ?? {},
        env: args.env,
      });
      if (!rollout.startupDashboard || !rollout.slackAgent || !rollout.slackAutoPost) {
        skipped += 1;
        continue;
      }

      const workspaceCadenceDays = parsePositiveInt(
        (workspace.metadata as Record<string, unknown> | null)?.[
          'audit_cadence_days'
        ],
        config.intervalDays,
        180
      );
      const scheduleDate =
        typeof workspace.metadata?.['audit_schedule_date'] === 'string'
          ? String(workspace.metadata['audit_schedule_date']).trim()
          : null;
      const scheduleTime =
        typeof workspace.metadata?.['audit_schedule_time'] === 'string'
          ? String(workspace.metadata['audit_schedule_time']).trim()
          : null;
      const scheduleTimezone =
        typeof workspace.metadata?.['audit_schedule_timezone'] === 'string'
          ? String(workspace.metadata['audit_schedule_timezone']).trim()
          : null;
      if (
        !isScheduleWindowReached({
          now,
          scheduleDate,
          scheduleTime,
          scheduleTimezone,
        })
      ) {
        skipped += 1;
        continue;
      }

      const siteUrl = toSiteUrl(workspace.primary_domain, workspace.canonical_domain);
      if (!siteUrl) {
        skipped += 1;
        continue;
      }

      const { data: latestReport, error: latestReportError } = await args.supabase
        .from('reports')
        .select('id,created_at')
        .eq('startup_workspace_id', workspace.id)
        .eq('type', 'deep_audit')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestReportError) throw latestReportError;

      if (!isDue((latestReport?.created_at as string | null) ?? null, now, workspaceCadenceDays)) {
        skipped += 1;
        continue;
      }

      const { data: lastAutoScan, error: lastAutoScanError } = await args.supabase
        .from('scans')
        .select('id,created_at')
        .eq('startup_workspace_id', workspace.id)
        .eq('run_source', 'startup_dashboard')
        .contains('full_results_json', { scheduler: { source: 'startup_slack_auto_post' } })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (lastAutoScanError) throw lastAutoScanError;

      const lastAutoScanAt = (lastAutoScan?.created_at as string | null) ?? null;
      const latestReportAt = (latestReport?.created_at as string | null) ?? null;
      if (lastAutoScanAt && (!latestReportAt || new Date(lastAutoScanAt).getTime() > new Date(latestReportAt).getTime())) {
        const lastAutoScanTs = new Date(lastAutoScanAt).getTime();
        const cooldownMs = 36 * 60 * 60 * 1000;
        if (Number.isFinite(lastAutoScanTs) && now.getTime() - lastAutoScanTs < cooldownMs) {
          skipped += 1;
          continue;
        }
      }

      const recipientEmail = await resolveWorkspaceRecipientEmail({
        supabase: args.supabase,
        startupWorkspaceId: workspace.id,
      });
      if (!recipientEmail) {
        skipped += 1;
        continue;
      }

      const domain = toDomain(siteUrl);
      const { data: insertedScan, error: insertScanError } = await args.supabase
        .from('scans')
        .insert({
          user_id: null,
          startup_workspace_id: workspace.id,
          url: siteUrl,
          domain,
          status: 'complete',
          run_source: 'startup_dashboard',
          full_results_json: {
            scheduler: {
              source: 'startup_slack_auto_post',
              queued_at: now.toISOString(),
              cadence_days: workspaceCadenceDays,
              schedule_date: scheduleDate,
              schedule_time: scheduleTime,
              schedule_timezone: scheduleTimezone,
            },
          },
        })
        .select('id')
        .single();
      if (insertScanError || !insertedScan?.id) {
        throw insertScanError ?? new Error('startup_auto_scan_insert_failed');
      }

      const syntheticPaymentId = `startup-auto-${workspace.id}-${insertedScan.id}`;
      const syntheticStripeSessionId = `startup-auto-session-${insertedScan.id}`;
      const syntheticSession = {
        id: syntheticStripeSessionId,
      } as Stripe.Checkout.Session;

      const queueResult = await ensureQueued(
        args.supabase as any,
        args.env,
        syntheticSession,
        recipientEmail,
        {
          id: syntheticPaymentId,
          scan_id: insertedScan.id as string,
        },
        false
      );

      if (!queueResult.ok) {
        failed += 1;
        logError('startup_slack_schedule_queue_failed', {
          startup_workspace_id: workspace.id,
          scan_id: insertedScan.id,
          reason: queueResult.reason,
          status: queueResult.status,
        });
        continue;
      }

      queued += 1;
      log(
        'startup_slack_schedule_enqueued',
        {
          startup_workspace_id: workspace.id,
          scan_id: insertedScan.id,
          recipient_email: recipientEmail,
          cadence_days: workspaceCadenceDays,
          schedule_date: scheduleDate,
          schedule_time: scheduleTime,
          schedule_timezone: scheduleTimezone,
        },
        'info'
      );
    } catch (error) {
      failed += 1;
      logError('startup_slack_schedule_workspace_failed', {
        startup_workspace_id: workspace.id,
        message: error instanceof Error ? error.message : 'unknown',
      });
    }
  }

  log(
    'startup_slack_schedule_completed',
    {
      examined_workspaces: examinedWorkspaces,
      queued,
      skipped,
      failed,
      cadence_days: config.intervalDays,
      workspace_batch_limit: config.workspaceBatchLimit,
    },
    'info'
  );

  return {
    status: 'completed',
    examinedWorkspaces,
    queued,
    skipped,
    failed,
  };
}
