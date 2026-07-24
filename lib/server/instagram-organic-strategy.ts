export const INSTAGRAM_PROFILE_STRATEGY = {
  name: 'GEO-Pulse · AI Visibility',
  bio: 'See how ChatGPT & Gemini understand your business. Fix what blocks citations. Track visibility and competitors. ↓ Free scan',
  link: 'https://getgeopulse.com/?utm_source=instagram&utm_medium=organic&utm_campaign=profile',
  highlights: ['Start here', 'AI visibility', 'Fixes', 'Results', 'For agencies'],
  pinnedPosts: [
    'What GEO-Pulse measures and why AI visibility matters',
    'A real, evidence-bounded audit walkthrough',
    'For agencies: monitor clients, competitors, prompts, and reports',
  ],
  contentMix: [
    'Original GEO education',
    'Product proof and redacted report screenshots',
    'Agency and SEO humor',
    'Original meme adaptations',
    'Carousels and diagrams',
    '9:16 motion and Reels',
  ],
} as const;

export type InstagramPerformance = {
  readonly qualifiedProfileVisits: number;
  readonly linkClicks: number;
  readonly scans: number;
  readonly activatedAccounts: number;
  readonly subscriptions: number;
  readonly follows: number;
  readonly reach: number;
};

/**
 * Business outcomes dominate vanity metrics. Reach and follows help break ties,
 * but a format that creates scans or revenue earns the next production slot.
 */
export function scoreInstagramPerformance(value: InstagramPerformance): number {
  return (
    value.subscriptions * 100 +
    value.activatedAccounts * 35 +
    value.scans * 20 +
    value.linkClicks * 5 +
    value.qualifiedProfileVisits * 2 +
    value.follows +
    Math.min(value.reach / 1000, 10)
  );
}

export function chooseInstagramFormat<T extends { readonly performance: InstagramPerformance }>(
  candidates: readonly T[]
): T | null {
  return [...candidates].sort(
    (a, b) => scoreInstagramPerformance(b.performance) - scoreInstagramPerformance(a.performance)
  )[0] ?? null;
}
