import { describe, expect, it, vi } from 'vitest';
import {
  attemptSafeCampaignRemediation,
  buildSeoContentFamily,
  isContentLoopSatisfied,
  prioritizeWithAcceptedLearning,
  retryIsDue,
  selectSeoFamilyIdsToDefer,
  seoParentCanClose,
  shouldReactivateExistingLoop,
} from './agent-loop-control';

describe('closed-loop agent control', () => {
  it('turns one approved SEO finding into a canonical cross-channel family', () => {
    const family = buildSeoContentFamily({
      keyword: 'ai visibility platform',
      opportunityTitle: 'Close the competitor gap',
    });

    expect(family.map((item) => item.contentType)).toEqual(['article', 'social_post']);
    expect(family[0]?.contentId).toBe('seo-agent:seo-ai-visibility-platform');
    expect(family[1]?.contentId).toContain(':instagram');
    expect(new Set(family.map((item) => item.slug)).size).toBe(2);
  });

  it('requires publication evidence before closing canonical and social loops', () => {
    expect(isContentLoopSatisfied({
      content_type: 'article',
      status: 'draft',
      canonical_url: '/blog/example',
    })).toBe(false);
    expect(isContentLoopSatisfied({
      content_type: 'social_post',
      status: 'approved',
    })).toBe(false);
    expect(isContentLoopSatisfied({
      content_type: 'article',
      status: 'published',
      canonical_url: '/blog/example',
    })).toBe(true);
    expect(isContentLoopSatisfied({
      content_type: 'social_post',
      status: 'published',
    })).toBe(true);
  });

  it('keeps the parent open until publication and a follow-up measurement are both proven', () => {
    const complete = [{ state: 'completed' }, { state: 'completed' }];
    expect(seoParentCanClose(complete, 0)).toBe(false);
    expect(seoParentCanClose([{ state: 'completed' }, { state: 'assigned' }], 1)).toBe(false);
    expect(seoParentCanClose(complete, 1)).toBe(true);
  });

  it('backs repairs off exponentially instead of retrying every hourly check', () => {
    const now = new Date('2026-07-27T12:00:00.000Z');
    expect(retryIsDue({ attemptCount: 1, lastAttemptedAt: '2026-07-27T11:30:00.000Z', now })).toBe(false);
    expect(retryIsDue({ attemptCount: 2, lastAttemptedAt: '2026-07-27T09:30:00.000Z', now })).toBe(true);
    expect(retryIsDue({ attemptCount: 5, lastAttemptedAt: '2026-07-26T18:00:00.000Z', now })).toBe(true);
  });

  it('uses only accepted positive learning as a bounded prioritization signal', () => {
    const ordered = prioritizeWithAcceptedLearning(
      [
        { id: 'technical', kind: 'technical', priority: 1, metadata: {} },
        { id: 'content', kind: 'content_gap', priority: 2, metadata: {} },
      ] as any,
      [{
        id: 'accepted-1',
        effectSize: 0.2,
        confidence: 0.8,
        cohortDefinition: { seo_kind: 'content_gap' },
      }],
    );
    expect(ordered.map((row) => row.id)).toEqual(['content', 'technical']);

    const withoutPositiveEvidence = prioritizeWithAcceptedLearning(
      [
        { id: 'technical', kind: 'technical', priority: 1, metadata: {} },
        { id: 'content', kind: 'content_gap', priority: 2, metadata: {} },
      ] as any,
      [{
        id: 'negative',
        effectSize: -0.2,
        confidence: 0.9,
        cohortDefinition: { seo_kind: 'content_gap' },
      }],
    );
    expect(withoutPositiveEvidence.map((row) => row.id)).toEqual(['technical', 'content']);
  });

  it('keeps active child families first and defers excess discoveries', () => {
    const deferred = selectSeoFamilyIdsToDefer(
      [
        { id: 'normal-1', severity: 'normal', due_at: '2026-07-28T00:00:00.000Z' },
        { id: 'active', severity: 'normal', due_at: '2026-07-29T00:00:00.000Z' },
        { id: 'urgent', severity: 'urgent', due_at: '2026-07-30T00:00:00.000Z' },
      ],
      [{ parent_loop_id: 'active', state: 'executing' }],
      2,
    );
    expect(deferred).toEqual(['normal-1']);
  });

  it('keeps measurement and governed campaign families ahead of unbounded gaps', () => {
    const deferred = selectSeoFamilyIdsToDefer(
      [
        { id: 'generic', state: 'executing', severity: 'today', due_at: '2026-07-28T00:00:00.000Z' },
        { id: 'governed', state: 'executing', severity: 'today', due_at: '2026-07-30T00:00:00.000Z', metadata: { closure_condition: 'Measure for 14 days.' } },
        { id: 'measuring', state: 'verifying', severity: 'today', due_at: '2026-07-31T00:00:00.000Z' },
      ],
      [],
      2,
    );
    expect(deferred).toEqual(['generic']);
  });

  it('keeps dismissed work stopped while allowing deferred discoveries to re-enter WIP', () => {
    expect(shouldReactivateExistingLoop('discovered')).toBe(true);
    expect(shouldReactivateExistingLoop('dismissed')).toBe(false);
  });

  it('skips a 403 prospect instead of leaving Maya with a repeating open loop', async () => {
    const eq = vi.fn(async () => ({ error: null }));
    const update = vi.fn(() => ({ eq }));
    const db = { from: vi.fn(() => ({ update })) } as any;

    const result = await attemptSafeCampaignRemediation({
      db,
      now: new Date('2026-07-26T12:00:00.000Z'),
      actions: [{
        key: 'prospect:abc',
        severity: 'now',
        owner: 'Elena',
        resolution: 'external',
        title: 'Blocked prospect',
        detail: 'HTTP 403',
        playbook: 'Skip it.',
        href: '/admin/outreach',
      }],
    });

    expect(update).toHaveBeenCalledWith({
      enabled: false,
      lifecycle_status: 'disqualified',
      last_error: null,
      next_action: null,
      exited_at: '2026-07-26T12:00:00.000Z',
      exit_reason: 'blocked_target_http_403',
      updated_at: '2026-07-26T12:00:00.000Z',
    });
    expect(eq).toHaveBeenCalledWith('id', 'abc');
    expect(result.get('prospect:abc')).toMatchObject({
      remediation: 'blocked_target_skipped',
    });
  });

  it('requeues a transient outreach failure for the next sweep', async () => {
    const eq = vi.fn(async () => ({ error: null }));
    const update = vi.fn(() => ({ eq }));
    const db = { from: vi.fn(() => ({ update })) } as any;

    const result = await attemptSafeCampaignRemediation({
      db,
      now: new Date('2026-07-26T12:00:00.000Z'),
      actions: [{
        key: 'prospect:timeout',
        severity: 'today',
        owner: 'Elena',
        resolution: 'agent',
        title: 'Transient failure',
        detail: 'Network timeout',
        playbook: 'Retry.',
        href: '/admin/outreach',
      }],
    });

    expect(update).toHaveBeenCalledWith({
      last_error: null,
      next_run_at: '2026-07-26T12:00:00.000Z',
    });
    expect(result.has('prospect:timeout')).toBe(false);
  });
});
