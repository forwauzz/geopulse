import { describe, expect, it } from 'vitest';
import type { IssueRow } from './deep-audit-report-helpers';
import { buildOwnerPage } from './owner-page';
import { buildCadencePlan } from './cadence-plan';
import { REMEDIATION_CATALOG, ownerRoleFor } from './remediation-catalog';
import { CHECK_CATALOG } from '../scan-engine/check-catalog';

function row(partial: Partial<IssueRow>): IssueRow {
  return { checkId: 'x', check: 'X', status: 'PASS', passed: true, weight: 5, finding: 'ok', ...partial } as IssueRow;
}

describe('remediation catalog (spec C9)', () => {
  it('covers every check in the scoring catalog', () => {
    const remedyIds = new Set(REMEDIATION_CATALOG.map((e) => e.checkId));
    for (const entry of CHECK_CATALOG) {
      expect(remedyIds.has(entry.id), `remediation entry missing for ${entry.id}`).toBe(true);
    }
  });

  it('never uses an "Engineering" owner label', () => {
    for (const e of REMEDIATION_CATALOG) {
      expect(e.ownerRole).not.toContain('Engineering');
    }
    expect(ownerRoleFor('ai-crawler-access')).toBe('Hosting/Cloudflare admin');
    expect(ownerRoleFor('unknown-future-check')).toBe('You');
  });

  it('every entry carries the seven delegation fields', () => {
    for (const e of REMEDIATION_CATALOG) {
      for (const field of [e.tool, e.clickPath, e.desiredState, e.copyPaste, e.verify, e.rollback, e.effort] as const) {
        expect(field.length, `${e.checkId} missing a delegation field`).toBeGreaterThan(5);
      }
    }
  });
});

describe('buildOwnerPage (spec C9)', () => {
  it('leads with access issues when eligibility checks fail', () => {
    const page = buildOwnerPage({
      score: 55,
      grade: 'F',
      issues: [
        row({ checkId: 'ai-crawler-access', check: 'AI retrieval agent access', status: 'FAIL', passed: false, weight: 12, finding: 'robots.txt blocks OAI-SearchBot.', fix: 'Allow it.' }),
        row({ checkId: 'title-tag', status: 'PASS' }),
      ],
    });
    expect(page.verdict).toContain('access-level');
    expect(page.blockedItems[0]).toContain('AI retrieval agent access');
    expect(page.exposure).not.toMatch(/\$\d/);
  });

  it('produces up to three quick wins with owner/effort/DIY/verify', () => {
    const page = buildOwnerPage({
      score: 60,
      grade: 'D',
      issues: [
        row({ checkId: 'ai-crawler-access', status: 'FAIL', passed: false, weight: 12, finding: 'blocked', fix: 'Allow bots.' }),
        row({ checkId: 'json-ld', status: 'FAIL', passed: false, weight: 6, finding: 'none', fix: 'Add schema.' }),
        row({ checkId: 'title-tag', status: 'FAIL', passed: false, weight: 4, finding: 'missing', fix: 'Write titles.' }),
        row({ checkId: 'eeat-signals', status: 'FAIL', passed: false, weight: 6, finding: 'no identity page', fix: 'Add About.' }),
      ],
    });
    expect(page.quickWins).toHaveLength(3);
    for (const w of page.quickWins) {
      expect(w.ownerRole.length).toBeGreaterThan(2);
      expect(w.ownerRole).not.toBe('Engineering');
      expect(w.effort.length).toBeGreaterThan(2);
      expect(['Do it yourself', 'Delegate/hire']).toContain(w.diyOrHire);
      expect(w.verify.length).toBeGreaterThan(5);
    }
  });

  it('separates not-tested from blocked and defers hygiene', () => {
    const page = buildOwnerPage({
      score: 70,
      grade: 'C-',
      issues: [
        row({ checkId: 'llm-qa-pattern', check: 'Answer structure', status: 'NOT_EVALUATED', passed: false, finding: 'not tested' }),
        row({ checkId: 'security-headers', check: 'Security response headers', status: 'FAIL', passed: false, finding: 'missing headers' }),
        row({ checkId: 'llms-txt', check: 'llms.txt (optional experiment)', status: 'PASS', finding: 'optional' }),
      ],
    });
    expect(page.notTestedItems).toHaveLength(1);
    expect(page.deferrals.some((d) => d.includes('Security'))).toBe(true);
    expect(page.deferrals.some((d) => d.toLowerCase().includes('optional'))).toBe(true);
  });
});

describe('buildCadencePlan (spec C11)', () => {
  it('produces the five dated phases from the generation date', () => {
    const phases = buildCadencePlan('2026-07-21T12:00:00.000Z');
    expect(phases).toHaveLength(5);
    expect(phases.map((p) => p.offsetDays)).toEqual([0, 14, 30, 60, 90]);
    expect(phases[0]?.date).toBe('2026-07-21');
    expect(phases[1]?.date).toBe('2026-08-04');
    expect(phases[4]?.date).toBe('2026-10-19');
    expect(phases[4]?.actions.join(' ')).toContain('baseline');
  });
});
