import { describe, expect, it } from 'vitest';
import { buildAuditDelta } from './audit-recurring-delta';

describe('recurring audit delta', () => {
  it('classifies resolved, regressed, unchanged, new, and not-comparable findings', () => {
    const result = buildAuditDelta({
      baseline: [
        { checkId: 'canonical', url: 'https://a.test/', status: 'FAIL', fix: 'Add canonical.' },
        { checkId: 'title', url: 'https://a.test/', status: 'PASS' },
        { checkId: 'schema', url: 'https://a.test/', status: 'WARNING', fix: 'Add schema.' },
        { checkId: 'robots', url: 'https://a.test/', status: 'NOT_EVALUATED' },
      ],
      current: [
        { checkId: 'canonical', url: 'https://a.test/', status: 'PASS' },
        { checkId: 'title', url: 'https://a.test/', status: 'FAIL', fix: 'Restore title.' },
        { checkId: 'schema', url: 'https://a.test/', status: 'WARNING', fix: 'Add schema.' },
        { checkId: 'robots', url: 'https://a.test/', status: 'PASS' },
        { checkId: 'faq', url: 'https://a.test/', status: 'FAIL', fix: 'Add direct answers.' },
      ],
      generatedAt: '2026-09-09T12:00:00.000Z',
    });

    expect(result.counts).toEqual({ new: 1, resolved: 1, regressed: 1, unchanged: 1, notComparable: 1 });
    expect(result.actions.find((item) => item.checkId === 'faq')).toMatchObject({ owner: 'content', verification: 'Run a fresh audit after the change and confirm this check passes on the same URL.' });
  });
});
