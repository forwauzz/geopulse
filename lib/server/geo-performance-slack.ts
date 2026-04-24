import type { GpmReportPayload } from './geo-performance-report-payload';
import {
  listStartupSlackDestinations,
  getStartupSlackDestination,
  sendStartupSlackMessage,
} from './startup-slack-integration';
import { structuredLog } from './structured-log';

type SupabaseLike = { from(table: string): any };

const PLATFORM_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT',
  gemini: 'Gemini',
  perplexity: 'Perplexity',
};

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function formatWindowDate(windowDate: string): string {
  if (/^\d{4}-\d{2}$/.test(windowDate)) {
    const [y, m] = windowDate.split('-');
    return new Date(Number(y), Number(m) - 1, 1).toLocaleString('en-US', {
      month: 'long',
      year: 'numeric',
    });
  }
  const weekMatch = windowDate.match(/^(\d{4})-W(\d{1,2})$/);
  if (weekMatch) return `Week ${Number(weekMatch[2])}, ${weekMatch[1]}`;
  return windowDate;
}

export function formatGpmSlackMessage(
  payload: GpmReportPayload,
  pdfUrl: string | null
): string {
  const platformLabel = PLATFORM_LABELS[payload.platform] ?? payload.platform;
  const window = formatWindowDate(payload.windowDate);
  const citedCount = payload.prompts.filter((p) => p.cited).length;
  const rankStr = payload.industryRank != null ? `#${payload.industryRank}` : '\u2014';

  const lines: string[] = [
    `*GEO Performance Report \u2014 ${payload.domain}*`,
    `${payload.topic}${payload.location ? `, ${payload.location}` : ''} \u00b7 ${platformLabel} \u00b7 ${window}`,
    '',
    `\u2022 *Visibility:* ${pct(payload.visibilityPct)}`,
    `\u2022 *Citation rate:* ${pct(payload.citationRate)} (${citedCount} of ${payload.prompts.length} queries)`,
    `\u2022 *Industry rank:* ${rankStr}`,
  ];

  if (payload.opportunities.length > 0) {
    lines.push('', '*Top opportunities:*');
    for (const opp of payload.opportunities.slice(0, 3)) {
      const competitor = opp.topCompetitorInQuery
        ? ` _(${opp.topCompetitorInQuery} appeared instead)_`
        : '';
      lines.push(`\u2022 ${opp.queryText}${competitor}`);
    }
  }

  if (pdfUrl) {
    lines.push('', `<${pdfUrl}|Download Full Report PDF>`);
  }

  return lines.join('\n');
}

export async function sendGpmReportSlackSummary(args: {
  readonly supabase: SupabaseLike;
  readonly startupWorkspaceId: string;
  readonly payload: GpmReportPayload;
  readonly pdfUrl: string | null;
  readonly configId: string;
}): Promise<void> {
  const destinations = await listStartupSlackDestinations({
    supabase: args.supabase,
    startupWorkspaceId: args.startupWorkspaceId,
  });

  const activeDefault =
    destinations.find((d) => d.isDefaultDestination && d.status === 'active') ??
    destinations.find((d) => d.status === 'active');

  if (!activeDefault) {
    structuredLog('gpm_slack_no_destination', {
      config_id: args.configId,
      startup_workspace_id: args.startupWorkspaceId,
    });
    return;
  }

  const resolved = await getStartupSlackDestination({
    supabase: args.supabase,
    startupWorkspaceId: args.startupWorkspaceId,
    destinationId: activeDefault.id,
  });

  if (!resolved) {
    structuredLog('gpm_slack_destination_not_resolved', {
      config_id: args.configId,
      destination_id: activeDefault.id,
    });
    return;
  }

  const text = formatGpmSlackMessage(args.payload, args.pdfUrl);

  await sendStartupSlackMessage({ destination: resolved, text });

  structuredLog('gpm_slack_report_sent', {
    config_id: args.configId,
    startup_workspace_id: args.startupWorkspaceId,
    channel_id: resolved.channelId,
    platform: args.payload.platform,
    window_date: args.payload.windowDate,
  });
}
