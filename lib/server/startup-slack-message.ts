export type StartupSlackEventType = 'new_audit_ready' | 'plan_ready';

export type StartupSlackMessagePayload = {
  readonly startup_workspace_id: string;
  readonly destination_id: string;
  readonly event_type: StartupSlackEventType;
  readonly site_domain: string;
  readonly score: number | null;
  readonly score_delta: number | null;
  readonly summary_bullets: string[];
  readonly report_url: string;
  readonly markdown_url: string | null;
  readonly sent_by_user_id: string;
};

function formatScoreDelta(value: number | null): string {
  if (value == null || Number.isNaN(value)) return 'n/a';
  const rounded = Math.round(value);
  if (rounded > 0) return `+${rounded}`;
  return `${rounded}`;
}

function normalizeBullets(values: string[]): string[] {
  return values
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
    .slice(0, 3);
}

export function formatStartupSlackMessage(payload: StartupSlackMessagePayload): string {
  const eventLabel =
    payload.event_type === 'plan_ready' ? 'Implementation plan ready' : 'Audit ready';
  const scoreValue =
    payload.score != null && !Number.isNaN(payload.score) ? `${Math.round(payload.score)}/100` : 'n/a';
  const bullets = normalizeBullets(payload.summary_bullets);

  const lines: string[] = [];
  lines.push(`${eventLabel} · ${payload.site_domain}`);
  lines.push(`Score: ${scoreValue} (delta: ${formatScoreDelta(payload.score_delta)})`);

  if (bullets.length > 0) {
    lines.push('Top actions:');
    for (const bullet of bullets) lines.push(`- ${bullet}`);
  }

  lines.push(`GEO-Pulse: ${payload.report_url}`);
  if (payload.markdown_url) lines.push(`Markdown: ${payload.markdown_url}`);

  return lines.join('\n');
}
