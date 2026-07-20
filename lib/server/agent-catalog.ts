import type { UserFeatureKey } from '@/lib/server/user-feature-grants';

/**
 * The agents a user can be given, in one place.
 *
 * `/dashboard/agents` renders this list rather than hard-coding cards, so adding an agent is one
 * entry here plus its page — and the sidebar, the hub and the admin grant UI cannot drift apart.
 *
 * `does` is deliberately phrased as the work performed, not the feature name. An agent that only
 * produces advice should say so plainly here, because that is the difference a user cares about.
 */
export type AgentDefinition = {
  readonly id: string;
  readonly name: string;
  readonly href: string;
  /** Material symbol name, matching the sidebar's icon set. */
  readonly icon: string;
  /** One line: what it does for you. */
  readonly does: string;
  /** Which per-user grant reveals it. */
  readonly feature: UserFeatureKey;
  /** Anything the agent needs before it can act, shown as a requirement on the card. */
  readonly requires?: string;
};

export const AGENT_CATALOG: readonly AgentDefinition[] = [
  {
    id: 'fix',
    name: 'Fix Agent',
    href: '/dashboard/agent',
    icon: 'auto_fix_high',
    does: 'Reads your latest audit and writes the exact changes to make — and opens a pull request when your site is in a connected repo.',
    feature: 'fix_agent',
    requires: 'A connected GitHub repo to open pull requests. Without one it still writes the changes for you to apply.',
  },
  {
    id: 'verify',
    name: 'Verify Agent',
    href: '/dashboard/agents/verify',
    icon: 'fact_check',
    does: 'Compares your two most recent audits of a site and tells you what actually changed — what you fixed, what regressed, and what is still failing.',
    feature: 'verify_agent',
    requires: 'Two audits of the same site, so there is a before and an after to compare.',
  },
  {
    id: 'recurring',
    name: 'Recurring Audits',
    href: '/dashboard/workspace',
    icon: 'update',
    does: 'Re-audits your site on a schedule and emails you the report, so a regression surfaces without you remembering to look.',
    feature: 'recurring_audits',
  },
];

/** The agents this user can see, in catalog order. */
export function agentsForUser(granted: ReadonlySet<string>): readonly AgentDefinition[] {
  return AGENT_CATALOG.filter((agent) => granted.has(agent.feature));
}
