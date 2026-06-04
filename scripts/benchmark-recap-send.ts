/**
 * CLI: manually trigger the daily benchmark recap.
 *
 * Runs the same fetch + analyzer + sender the Cloudflare worker uses on the
 * 19:00 Toronto cron, but bypasses the time gate so you can preview or force-
 * send a recap at any time.
 *
 * Usage:
 *   npm run benchmark:recap:send -- --dry-run
 *     → Prints the text body to stdout, does NOT send email.
 *
 *   npm run benchmark:recap:send
 *     → Sends the recap to BENCHMARK_DAILY_RECAP_TO via Resend.
 *
 *   npm run benchmark:recap:send -- --to other@example.com --vertical law_firms --window-hours 48
 *     → Overrides recipient / vertical / window.
 */

import { createServiceRoleClient } from '../lib/supabase/service-role';
import {
  fetchAndBuildBenchmarkDailyRecap,
  renderBenchmarkDailyRecapText,
  sendBenchmarkDailyRecap,
} from '../lib/server/benchmark-daily-recap';

type CliArgs = {
  readonly dryRun: boolean;
  readonly vertical: string;
  readonly to: string | null;
  readonly windowHours: number;
};

function parseArgs(argv: string[]): CliArgs {
  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token || !token.startsWith('--')) continue;
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      flags.add(token.slice(2));
      continue;
    }
    values.set(token.slice(2), next);
    i += 1;
  }

  const windowHoursRaw = values.get('window-hours');
  const windowHours = windowHoursRaw ? Number.parseInt(windowHoursRaw, 10) : 24;

  return {
    dryRun: flags.has('dry-run'),
    vertical:
      values.get('vertical')?.trim() ||
      process.env['BENCHMARK_SCHEDULE_VERTICAL']?.trim() ||
      'marketing_firms',
    to: values.get('to')?.trim() ?? null,
    windowHours: Number.isFinite(windowHours) && windowHours > 0 ? windowHours : 24,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  const supaUrl = process.env['NEXT_PUBLIC_SUPABASE_URL'];
  const supaKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];
  if (!supaUrl || !supaKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .dev.vars / .env.local.');
    process.exit(1);
  }

  const supabase = createServiceRoleClient(supaUrl, supaKey);

  console.error(
    `Fetching recap for vertical=${args.vertical}, window=${args.windowHours}h…`
  );

  const recap = await fetchAndBuildBenchmarkDailyRecap({
    supabase,
    vertical: args.vertical,
    now: new Date(),
    windowHours: args.windowHours,
  });

  const text = renderBenchmarkDailyRecapText(recap);

  if (args.dryRun) {
    console.log(text);
    console.error('');
    console.error('(--dry-run) No email sent.');
    return;
  }

  const resendKey = process.env['RESEND_API_KEY'];
  const resendFrom = process.env['RESEND_FROM_EMAIL'];
  if (!resendKey || !resendFrom) {
    console.error('Missing RESEND_API_KEY or RESEND_FROM_EMAIL — cannot send.');
    process.exit(1);
  }

  const recipient =
    args.to ?? process.env['BENCHMARK_DAILY_RECAP_TO']?.trim() ?? null;
  if (!recipient) {
    console.error(
      'No recipient. Provide --to <email> or set BENCHMARK_DAILY_RECAP_TO.'
    );
    process.exit(1);
  }

  console.error(`Sending recap to ${recipient}…`);
  const result = await sendBenchmarkDailyRecap({
    recap,
    resendApiKey: resendKey,
    from: resendFrom,
    to: recipient,
  });

  if (!result.ok) {
    console.error('Resend send failed:', result.reason);
    process.exit(1);
  }

  console.log('recap email sent ok');
  console.log(`  to:              ${recipient}`);
  console.log(`  vertical:        ${recap.vertical}`);
  console.log(`  window:          ${recap.windowStart} → ${recap.windowEnd}`);
  console.log(`  completed runs:  ${recap.runStatus.completed}`);
  console.log(`  failed runs:     ${recap.runStatus.failed}`);
  console.log(`  total citations: ${recap.totalCitations}`);
  console.log(`  cited domains:   ${recap.distinctDomainsCited}`);
  if (result.id) console.log(`  resend id:       ${result.id}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
