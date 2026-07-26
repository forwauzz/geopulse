import { describe, expect, it, vi } from 'vitest';
import {
  attemptSafeCampaignRemediation,
  buildSeoContentFamily,
} from './agent-loop-control';

describe('closed-loop agent control', () => {
  it('turns one approved SEO finding into a canonical cross-channel family', () => {
    const family = buildSeoContentFamily({
      keyword: 'ai visibility platform',
      opportunityTitle: 'Close the competitor gap',
    });

    expect(family.map((item) => item.contentType)).toEqual([
      'article',
      'newsletter',
      'social_post',
    ]);
    expect(family[0]?.contentId).toBe('seo-agent:seo-ai-visibility-platform');
    expect(family[1]?.contentId).toContain(':newsletter');
    expect(family[2]?.contentId).toContain(':instagram');
    expect(new Set(family.map((item) => item.slug)).size).toBe(3);
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
      last_error: null,
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
