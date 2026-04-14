import { describe, expect, it } from 'vitest';
import { buildDeterministicChecks } from '../scan-engine/checks/registry';
import { TEAM_OWNER_MAP, getTeamOwner } from './team-owner-map';
import type { TeamOwner } from './team-owner-map';

/**
 * Derive deterministic check IDs from the live registry so this test
 * automatically catches any new check that is added without a corresponding
 * team-owner mapping.
 */
const DETERMINISTIC_CHECK_IDS = buildDeterministicChecks().map((c) => c.id);

/**
 * LLM checks require a provider factory to instantiate and are not returned
 * by buildDeterministicChecks. Their IDs are stable constants.
 */
const LLM_CHECK_IDS = ['llm-qa-pattern', 'llm-extractability'] as const;

const ALL_REGISTRY_CHECK_IDS = [...DETERMINISTIC_CHECK_IDS, ...LLM_CHECK_IDS];

const VALID_OWNERS: TeamOwner[] = ['Engineering', 'Content', 'Brand', 'Product'];

describe('team-owner-map', () => {
  it('covers every check ID registered in the audit registry', () => {
    for (const id of ALL_REGISTRY_CHECK_IDS) {
      expect(TEAM_OWNER_MAP[id], `missing owner for check: ${id}`).toBeDefined();
    }
  });

  it('maps every entry to a valid TeamOwner value', () => {
    for (const [id, owner] of Object.entries(TEAM_OWNER_MAP)) {
      expect(VALID_OWNERS, `invalid owner "${owner}" for check: ${id}`).toContain(owner);
    }
  });

  it('getTeamOwner returns the correct owner for each check', () => {
    expect(getTeamOwner('ai-crawler-access')).toBe('Engineering');
    expect(getTeamOwner('llm-qa-pattern')).toBe('Content');
    expect(getTeamOwner('eeat-signals')).toBe('Brand');
    expect(getTeamOwner('open-graph')).toBe('Brand');
  });

  it('getTeamOwner returns undefined for unknown check IDs', () => {
    expect(getTeamOwner('non-existent-check')).toBeUndefined();
    expect(getTeamOwner('')).toBeUndefined();
  });

  it('has exactly 11 Engineering, 9 Content, 2 Brand, 0 Product checks', () => {
    const counts: Record<string, number> = { Engineering: 0, Content: 0, Brand: 0, Product: 0 };
    for (const owner of Object.values(TEAM_OWNER_MAP)) {
      counts[owner] = (counts[owner] ?? 0) + 1;
    }
    expect(counts['Engineering']).toBe(11);
    expect(counts['Content']).toBe(9);
    expect(counts['Brand']).toBe(2);
    expect(counts['Product']).toBe(0);
  });
});
