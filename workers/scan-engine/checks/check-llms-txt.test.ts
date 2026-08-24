import { describe, expect, it } from 'vitest';
import type { CheckContext } from '../../lib/interfaces/audit';
import { llmsTxtCheck } from './check-llms-txt';

function context(llmsTxtContent: string): CheckContext {
  return { llmsTxtContent } as CheckContext;
}

describe('llmsTxtCheck', () => {
  it('keeps an absent file optional and weightless without a categorical adoption claim', async () => {
    const result = await llmsTxtCheck.run(context(''));

    expect(llmsTxtCheck.weight).toBe(0);
    expect(result).toMatchObject({ passed: true, status: 'PASS' });
    expect(result.finding).toContain('v2 proposal is optional');
    expect(result.finding).toContain('no watched engine documents a ranking or citation benefit');
    expect(result.finding).not.toContain('No major AI engine honors');
  });

  it('describes a present file as agent-readable without promising visibility', async () => {
    const result = await llmsTxtCheck.run(context('# Example\n\n> An overview.'));

    expect(result.finding).toContain('optional agent-readable overview');
    expect(result.finding).toContain('no measurable visibility benefit is promised');
    expect(result.finding).not.toContain('uses it as a citation signal');
  });
});
