/**
 * Maps audit check IDs to their primary team owner for report framing.
 *
 * Derived from RD-001 team-owner taxonomy (PLAYBOOK/rd-001-team-owner-taxonomy-v1.md).
 * Owner assignment reflects who is accountable for the fix — not who implements the tag.
 *
 * When a new check is added to the registry, add it here too.
 */

export type TeamOwner = 'Engineering' | 'Content' | 'Brand' | 'Product';

/**
 * Primary team owner by check ID.
 * Returns undefined for check IDs not yet in the taxonomy (future checks).
 */
export const TEAM_OWNER_MAP: Readonly<Record<string, TeamOwner>> = {
  // Engineering — server config, technical directives, infrastructure
  'ai-crawler-access': 'Engineering',
  'llms-txt': 'Engineering',
  'json-ld': 'Engineering',
  'schema-types': 'Engineering',
  'security-headers': 'Engineering',
  'snippet-eligibility': 'Engineering',
  canonical: 'Engineering',
  'robots-meta': 'Engineering',
  'https-only': 'Engineering',
  viewport: 'Engineering',
  'html-size': 'Engineering',

  // Content — writing, editorial structure, page maintenance
  'llm-qa-pattern': 'Content',
  'llm-extractability': 'Content',
  'heading-structure': 'Content',
  'title-tag': 'Content',
  'meta-description': 'Content',
  freshness: 'Content',
  'internal-links': 'Content',
  'external-links': 'Content',
  'alt-text': 'Content',

  // Brand — organizational identity, credibility signals, brand representation
  'eeat-signals': 'Brand',
  'open-graph': 'Brand',

  // Product — conversion signals, CTA presence, business information
  // (no checks currently implemented in this category)
} as const;

/**
 * Returns the primary team owner for a given check ID.
 * Returns undefined if the check ID is not in the taxonomy.
 */
export function getTeamOwner(checkId: string): TeamOwner | undefined {
  return TEAM_OWNER_MAP[checkId];
}
