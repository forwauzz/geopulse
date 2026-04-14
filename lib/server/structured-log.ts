import { createServiceRoleClient } from '@/lib/supabase/service-role';

export type StructuredLogPrimitive = string | number | boolean | null | undefined;
export type StructuredLogData = Record<string, StructuredLogPrimitive>;
export type StructuredLogLevel = 'info' | 'warning' | 'error';

const MAX_LOG_STRING_LENGTH = 500;
const SENSITIVE_KEY_RE = /(secret|token|password|authorization|api[_-]?key|service[_-]?role)/i;

function truncateLogString(value: string): string {
  if (value.length <= MAX_LOG_STRING_LENGTH) return value;
  return `${value.slice(0, MAX_LOG_STRING_LENGTH)}…`;
}

export function sanitizeStructuredLogData(data: StructuredLogData): Record<string, string | number | boolean | null> {
  const sanitized: Record<string, string | number | boolean | null> = {};

  for (const [key, value] of Object.entries(data)) {
    if (typeof value === 'undefined') continue;

    if (SENSITIVE_KEY_RE.test(key)) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    if (typeof value === 'string') {
      sanitized[key] = truncateLogString(value);
      continue;
    }

    sanitized[key] = value;
  }

  return sanitized;
}

function resolveStructuredLogConfig():
  | { ok: true; supabaseUrl: string; serviceRoleKey: string }
  | { ok: false } {
  const supabaseUrl = process.env['NEXT_PUBLIC_SUPABASE_URL']?.trim() ?? '';
  const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY']?.trim() ?? '';
  if (!supabaseUrl || !serviceRoleKey) {
    return { ok: false };
  }

  return {
    ok: true,
    supabaseUrl,
    serviceRoleKey,
  };
}

async function persistStructuredLogEntry(args: {
  readonly level: StructuredLogLevel;
  readonly event: string;
  readonly data: Record<string, string | number | boolean | null>;
}): Promise<void> {
  const config = resolveStructuredLogConfig();
  if (!config.ok) return;

  try {
    const supabase = createServiceRoleClient(config.supabaseUrl, config.serviceRoleKey);
    await supabase.from('app_logs').insert({
      level: args.level,
      event: args.event,
      data: args.data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown';
    // eslint-disable-next-line no-console -- log persistence must never recurse into structured logging
    console.error(JSON.stringify({ event: 'structured_log_persist_failed', message }));
  }
}

function writeConsoleLog(level: StructuredLogLevel, event: string, data: Record<string, string | number | boolean | null>): void {
  const line = JSON.stringify({ level, event, ...data, t: Date.now() });
  if (level === 'error') {
    // eslint-disable-next-line no-console -- Workers/Next runtime observability
    console.error(line);
    return;
  }

  // eslint-disable-next-line no-console -- Workers/Next runtime observability
  console.warn(line);
}

export function structuredLog(
  event: string,
  data: StructuredLogData,
  level: StructuredLogLevel = 'warning'
): void {
  const sanitized = sanitizeStructuredLogData(data);
  writeConsoleLog(level, event, sanitized);
  void persistStructuredLogEntry({ level, event, data: sanitized });
}

export function structuredError(event: string, data: StructuredLogData): void {
  structuredLog(event, data, 'error');
}
