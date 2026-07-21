import { describe, expect, it } from 'vitest';
import type { CheckContext, PageSignals } from '../../lib/interfaces/audit';
import { jsonLdCheck, validateJsonLd } from './check-jsonld';

function ctx(blocks: unknown[], textSample = ''): CheckContext {
  return {
    signals: { jsonLdBlocks: blocks } as PageSignals,
    finalUrl: 'https://example.com/',
    textSample,
    robotsTxtContent: '',
    llmsTxtContent: '',
    responseHeaders: {},
  };
}

describe('json-ld strict validation (spec C7 — presence alone must NOT pass)', () => {
  it('fails with no blocks', async () => {
    const r = await jsonLdCheck.run(ctx([]));
    expect(r.status).toBe('FAIL');
  });

  it('fails when a block exists but lacks required properties', async () => {
    const r = await jsonLdCheck.run(ctx([{ '@type': 'LocalBusiness' }], 'Acme IT Services'));
    expect(r.status).toBe('FAIL');
    expect(r.finding).toContain('does not validate');
    expect(r.finding).toContain('address');
  });

  it('fails when only unrecognized types are present', async () => {
    const r = await jsonLdCheck.run(ctx([{ '@type': 'Thing', name: 'x' }], 'x'));
    expect(r.status).toBe('FAIL');
  });

  it('warns when valid schema does not match visible content', async () => {
    const r = await jsonLdCheck.run(
      ctx(
        [{ '@type': 'Organization', name: 'Totally Different Co' }],
        'Acme IT Services — managed IT for Montreal businesses'
      )
    );
    expect(r.status).toBe('WARNING');
  });

  it('passes only on valid type + required props + visible-content match', async () => {
    const r = await jsonLdCheck.run(
      ctx(
        [{ '@type': 'LocalBusiness', name: 'Acme IT Services', address: '1 Main St, Montreal' }],
        'Welcome to Acme IT Services, managed IT support in Montreal.'
      )
    );
    expect(r.status).toBe('PASS');
    expect(r.finding).toContain('LocalBusiness');
  });

  it('unwraps @graph containers', () => {
    const v = validateJsonLd(
      [{ '@context': 'https://schema.org', '@graph': [{ '@type': 'Organization', name: 'Acme' }] }],
      'acme'
    );
    expect(v.validated).toHaveLength(1);
    expect(v.validated[0]?.matchesVisibleContent).toBe(true);
  });
});
