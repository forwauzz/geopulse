export type SocialAttributionEvent = {
  readonly event_id: string;
  readonly event_name: string;
  readonly anonymous_id: string | null;
  readonly scan_id: string | null;
  readonly utm_campaign: string | null;
  readonly utm_content: string | null;
};

export type SocialContentFunnel = {
  readonly content: string;
  readonly sessions: number;
  readonly scans: number;
  readonly reportsDelivered: number;
  readonly reportsViewed: number;
  readonly checkouts: number;
  readonly payments: number;
};

const SOCIAL_CAMPAIGN = 'autonomous_social';
type FunnelSets = {
  sessions: Set<string>;
  scans: Set<string>;
  reportsDelivered: Set<string>;
  reportsViewed: Set<string>;
  checkouts: Set<string>;
  payments: Set<string>;
};

export function buildSocialContentFunnels(
  events: readonly SocialAttributionEvent[]
): SocialContentFunnel[] {
  const contentByAnon = new Map<string, string>();
  const contentByScan = new Map<string, string>();

  for (const event of events) {
    if (event.utm_campaign !== SOCIAL_CAMPAIGN || !event.utm_content) continue;
    if (event.anonymous_id) contentByAnon.set(event.anonymous_id, event.utm_content);
    if (event.scan_id) contentByScan.set(event.scan_id, event.utm_content);
  }
  for (const event of events) {
    if (!event.scan_id || contentByScan.has(event.scan_id) || !event.anonymous_id) continue;
    const content = contentByAnon.get(event.anonymous_id);
    if (content) contentByScan.set(event.scan_id, content);
  }

  const sets = new Map<string, FunnelSets>();
  for (const event of events) {
    const content =
      (event.utm_campaign === SOCIAL_CAMPAIGN ? event.utm_content : null)
      ?? (event.scan_id ? contentByScan.get(event.scan_id) : null)
      ?? (event.anonymous_id ? contentByAnon.get(event.anonymous_id) : null);
    if (!content) continue;

    const row = sets.get(content) ?? {
      sessions: new Set<string>(),
      scans: new Set<string>(),
      reportsDelivered: new Set<string>(),
      reportsViewed: new Set<string>(),
      checkouts: new Set<string>(),
      payments: new Set<string>(),
    };
    const anonKey = event.anonymous_id ?? event.event_id;
    const scanKey = event.scan_id ?? event.event_id;
    if (event.event_name === 'session_started') row.sessions.add(anonKey);
    if (event.event_name === 'scan_completed') row.scans.add(scanKey);
    if (event.event_name === 'report_delivered') row.reportsDelivered.add(scanKey);
    if (event.event_name === 'report_viewed') row.reportsViewed.add(scanKey);
    if (event.event_name === 'checkout_started') row.checkouts.add(scanKey);
    if (event.event_name === 'payment_completed') row.payments.add(scanKey);
    sets.set(content, row);
  }

  return Array.from(sets, ([content, row]) => ({
    content,
    sessions: row.sessions.size,
    scans: row.scans.size,
    reportsDelivered: row.reportsDelivered.size,
    reportsViewed: row.reportsViewed.size,
    checkouts: row.checkouts.size,
    payments: row.payments.size,
  })).sort((a, b) =>
    b.payments - a.payments
    || b.scans - a.scans
    || b.sessions - a.sessions
    || a.content.localeCompare(b.content)
  );
}
