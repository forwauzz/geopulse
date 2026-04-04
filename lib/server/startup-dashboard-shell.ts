import type { StartupDashboardData } from './startup-dashboard-data';

export type StartupTrendPoint = {
  readonly label: string;
  readonly score: number;
};

export type StartupActionItem = {
  readonly key: string;
  readonly title: string;
  readonly detail: string;
  readonly priority: 'high' | 'medium';
};

export function buildStartupTrendSeries(
  scans: StartupDashboardData['scans'],
  maxPoints = 8
): StartupTrendPoint[] {
  const scored = scans
    .filter((scan): scan is typeof scan & { score: number } => typeof scan.score === 'number')
    .slice(0, maxPoints)
    .reverse();

  return scored.map((scan) => ({
    label: new Date(scan.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    score: scan.score,
  }));
}

export function buildStartupActionBacklog(data: StartupDashboardData): StartupActionItem[] {
  const reportByScanId = new Set(
    data.reports.filter((report) => report.scanId).map((report) => report.scanId as string)
  );

  const items: StartupActionItem[] = [];

  for (const scan of data.scans) {
    if (!reportByScanId.has(scan.id)) {
      items.push({
        key: `deep-audit-${scan.id}`,
        title: `Run deep audit for ${scan.domain}`,
        detail: 'No deep audit artifact is linked yet for this scan.',
        priority: 'high',
      });
    }

    if (typeof scan.score === 'number' && scan.score < 70) {
      items.push({
        key: `low-score-${scan.id}`,
        title: `Address low score on ${scan.domain}`,
        detail: `Current score is ${scan.score}/100. Prioritize crawlability and extractability fixes.`,
        priority: 'high',
      });
    }
  }

  if (items.length === 0) {
    items.push({
      key: 'no-blockers',
      title: 'No blocking implementation items',
      detail: 'Current workspace scans are covered by reports and baseline scores.',
      priority: 'medium',
    });
  }

  return items.slice(0, 6);
}
