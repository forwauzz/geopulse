import { describe, expect, it } from 'vitest';
import { buildLayerOneReportRewritePrompt } from './layer-one-report-rewrite-prompt';

describe('buildLayerOneReportRewritePrompt', () => {
  it('includes the frozen rewrite constraints and the source report', () => {
    const prompt = buildLayerOneReportRewritePrompt({
      reportMarkdown: '# GEO-Pulse - AI Search Readiness Report\n\n## Executive Summary\n\nExample report.',
    });

    expect(prompt).toContain('Use this exact section order:');
    expect(prompt).toContain('2. Confirmed audit findings');
    expect(prompt).toContain('5. Optional advanced GEO improvements');
    expect(prompt).toContain('Do not invent market statistics');
    expect(prompt).toContain(
      'Each recommendation must include: Issue, Why it matters, Action, Priority, Confidence.'
    );
    expect(prompt).toContain('observed signal, bounded implication, verification step');
    expect(prompt).toContain('# GEO-Pulse - AI Search Readiness Report');
  });
});
