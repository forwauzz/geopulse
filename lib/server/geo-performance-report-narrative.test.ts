import { describe, expect, it } from 'vitest';
import { buildGpmNarrativePrompt } from './geo-performance-report-narrative';
import type { GpmReportPayload } from './geo-performance-report-payload';

const basePayload: GpmReportPayload = {
  configId: 'config-001',
  domain: 'elitephysio.ca',
  topic: 'Vestibular Rehabilitation',
  location: 'Vancouver',
  windowDate: '2026-04',
  platform: 'gemini',
  modelId: 'gemini-2.0-flash',
  reportedAt: '2026-04-23T12:00:00Z',
  citationRate: 0.7,
  shareOfVoice: 0.35,
  queryCoverage: 0.8,
  visibilityPct: 0.65,
  industryRank: 2.4,
  prompts: [
    { queryKey: 'q1', queryText: 'Best vestibular rehab clinics in Vancouver', cited: true, rankPosition: 2, topCompetitorInQuery: 'vestibularbc.com' },
    { queryKey: 'q2', queryText: 'Vestibular therapy near me', cited: false, rankPosition: null, topCompetitorInQuery: 'physioworks.ca' },
    { queryKey: 'q3', queryText: 'Dizziness specialist Vancouver', cited: true, rankPosition: 1, topCompetitorInQuery: null },
  ],
  competitors: [
    { name: 'vestibularbc.com', citationCount: 5, totalQueries: 3 },
  ],
  opportunities: [
    { queryText: 'Vestibular therapy near me', topCompetitorInQuery: 'physioworks.ca' },
  ],
};

describe('buildGpmNarrativePrompt', () => {
  it('includes domain and location in the prompt', () => {
    const prompt = buildGpmNarrativePrompt(basePayload);
    expect(prompt).toContain('elitephysio.ca');
    expect(prompt).toContain('Vancouver');
  });

  it('includes topic in the prompt', () => {
    const prompt = buildGpmNarrativePrompt(basePayload);
    expect(prompt).toContain('Vestibular Rehabilitation');
  });

  it('includes formatted visibility pct', () => {
    const prompt = buildGpmNarrativePrompt(basePayload);
    expect(prompt).toContain('65%');
  });

  it('includes citation rate', () => {
    const prompt = buildGpmNarrativePrompt(basePayload);
    expect(prompt).toContain('70%');
  });

  it('includes the platform label (not raw key)', () => {
    const prompt = buildGpmNarrativePrompt(basePayload);
    expect(prompt).toContain('Gemini');
    expect(prompt).not.toContain('platform: gemini');
  });

  it('uses ChatGPT label for chatgpt platform', () => {
    const prompt = buildGpmNarrativePrompt({ ...basePayload, platform: 'chatgpt' });
    expect(prompt).toContain('ChatGPT');
  });

  it('uses Perplexity label for perplexity platform', () => {
    const prompt = buildGpmNarrativePrompt({ ...basePayload, platform: 'perplexity' });
    expect(prompt).toContain('Perplexity');
  });

  it('formats monthly window date as month + year', () => {
    const prompt = buildGpmNarrativePrompt(basePayload);
    expect(prompt).toContain('April 2026');
  });

  it('formats weekly window date as week number + year', () => {
    const prompt = buildGpmNarrativePrompt({ ...basePayload, windowDate: '2026-W07' });
    expect(prompt).toContain('Week 7');
    expect(prompt).toContain('2026');
  });

  it('includes the top-ranked cited query as the top win', () => {
    const prompt = buildGpmNarrativePrompt(basePayload);
    // q3 has rank 1, so it should be the top win
    expect(prompt).toContain('Dizziness specialist Vancouver');
  });

  it('includes the first opportunity query', () => {
    const prompt = buildGpmNarrativePrompt(basePayload);
    expect(prompt).toContain('Vestibular therapy near me');
  });

  it('includes competitor that appeared in opportunity', () => {
    const prompt = buildGpmNarrativePrompt(basePayload);
    expect(prompt).toContain('physioworks.ca');
  });

  it('includes top competitor co-citation', () => {
    const prompt = buildGpmNarrativePrompt(basePayload);
    expect(prompt).toContain('vestibularbc.com');
  });

  it('handles null industry rank gracefully', () => {
    const prompt = buildGpmNarrativePrompt({ ...basePayload, industryRank: null });
    expect(prompt).toContain('insufficient');
  });

  it('handles no cited prompts (zero wins)', () => {
    const noCited = basePayload.prompts.map((p) => ({ ...p, cited: false, rankPosition: null }));
    const prompt = buildGpmNarrativePrompt({ ...basePayload, prompts: noCited, industryRank: null });
    expect(prompt).toContain('No queries resulted');
  });

  it('handles no opportunities (all cited)', () => {
    const prompt = buildGpmNarrativePrompt({ ...basePayload, opportunities: [] });
    expect(prompt).toContain('All tracked queries');
  });

  it('handles no competitors', () => {
    const prompt = buildGpmNarrativePrompt({ ...basePayload, competitors: [] });
    expect(prompt).toContain('No competitor co-citations');
  });

  it('instructs Claude to avoid LLM jargon', () => {
    const prompt = buildGpmNarrativePrompt(basePayload);
    expect(prompt).toContain('AI search');
    expect(prompt).not.toContain('language model');
  });

  it('instructs Claude to output only the paragraph', () => {
    const prompt = buildGpmNarrativePrompt(basePayload);
    expect(prompt).toContain('Output only the paragraph');
  });

  it('instructs Claude to write 3–4 sentences', () => {
    const prompt = buildGpmNarrativePrompt(basePayload);
    expect(prompt).toContain('3\u20134 sentence');
  });
});
