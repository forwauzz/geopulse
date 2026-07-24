import { describe, expect, it } from 'vitest';
import { buildOutcomeActions } from './client-outcome-engine';

describe('buildOutcomeActions', () => {
  const scan = {
    issues_json: [
      { checkId: 'jsonld', check: 'Add structured data', passed: false, weight: 9, finding: 'Missing', fix: 'Add Organization JSON-LD.' },
      { checkId: 'title', check: 'Clarify title', passed: false, weight: 4, finding: 'Vague', fix: 'Name the service and city.' },
      { checkId: 'robots', check: 'Crawler access', passed: true, weight: 10, finding: '', fix: null },
    ],
  };

  it('ranks real audit and uncited-prompt actions by impact and effort', () => {
    const actions = buildOutcomeActions({
      scan,
      uncitedPrompts: ['best vestibular therapy in Vancouver'],
      events: [],
    });
    expect(actions.map((action) => action.key)).toEqual([
      'audit:jsonld',
      'audit:title',
      'prompt:best vestibular therapy in vancouver',
    ]);
    expect(actions[0]).toMatchObject({
      impact: 'high',
      effort: 'medium',
      status: 'pending',
      source: 'website_audit',
    });
  });

  it('keeps completion state and history keyed to the recommendation', () => {
    const actions = buildOutcomeActions({
      scan,
      uncitedPrompts: [],
      events: [{
        actionKey: 'audit:jsonld',
        status: 'completed',
        at: '2026-07-24T12:00:00.000Z',
        byUserId: 'user-1',
      }],
    });
    const completed = actions.find((action) => action.key === 'audit:jsonld');
    expect(completed).toMatchObject({
      status: 'completed',
      completedAt: '2026-07-24T12:00:00.000Z',
    });
    expect(actions.at(-1)?.key).toBe('audit:jsonld');
  });
});
