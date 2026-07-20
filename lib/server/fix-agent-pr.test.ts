import { describe, expect, it } from 'vitest';
import { buildFixesMarkdown, safeFilePathFor } from './fix-agent-pr';
import type { AgentFix } from './fix-agent';

const fix = (over: Partial<AgentFix>): AgentFix => ({
  title: 'Add something',
  why: 'because',
  where: '<head> of every page',
  snippet: '<meta name="description" content="x" />',
  ...over,
});

describe('fix-agent PR safety', () => {
  it('places standalone files it can own unambiguously', () => {
    expect(safeFilePathFor(fix({ title: 'Add llms.txt', where: 'site root: /llms.txt' }))).toBe(
      'public/llms.txt'
    );
    expect(safeFilePathFor(fix({ title: 'Add robots.txt', where: '/robots.txt' }))).toBe(
      'public/robots.txt'
    );
  });

  it('REFUSES to auto-write anything that edits existing source', () => {
    // The whole safety posture: code-level edits stay a human checklist item.
    expect(safeFilePathFor(fix({ title: 'Add meta description', where: '<head> of every page' }))).toBeNull();
    expect(safeFilePathFor(fix({ title: 'Add JSON-LD', where: 'app/layout.tsx' }))).toBeNull();
    expect(safeFilePathFor(fix({ title: 'Set security headers', where: 'next.config.ts' }))).toBeNull();
  });

  it('writes a checklist that marks what was committed vs left to the human', () => {
    const md = buildFixesMarkdown('example.com', [
      fix({ title: 'Add llms.txt', where: '/llms.txt', snippet: '# llms' }),
      fix({ title: 'Add JSON-LD', where: 'app/layout.tsx', snippet: '{"@type":"Organization"}' }),
    ]);
    expect(md).toContain('example.com');
    expect(md).toContain('committed to `public/llms.txt`');
    expect(md).toContain('apply manually');
    // Snippets must survive verbatim so they can be copied.
    expect(md).toContain('{"@type":"Organization"}');
  });
});
