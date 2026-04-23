import { describe, expect, it } from 'vitest';
import { buildGpmReportPdf } from './geo-performance-report-pdf';
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
    {
      queryKey: 'best-vestibular-rehab-vancouver',
      queryText: 'Best vestibular rehabilitation clinics in Vancouver',
      cited: true,
      rankPosition: 2,
      topCompetitorInQuery: 'vestibularbc.com',
    },
    {
      queryKey: 'vestibular-therapy-near-me',
      queryText: 'Vestibular therapy near me in Vancouver',
      cited: false,
      rankPosition: null,
      topCompetitorInQuery: 'physioworks.ca',
    },
    {
      queryKey: 'dizzy-specialist-vancouver',
      queryText: 'Dizziness specialist physiotherapist Vancouver',
      cited: true,
      rankPosition: 1,
      topCompetitorInQuery: null,
    },
  ],
  competitors: [
    { name: 'vestibularbc.com', citationCount: 5, totalQueries: 10 },
    { name: 'physioworks.ca', citationCount: 3, totalQueries: 10 },
  ],
  opportunities: [
    {
      queryText: 'Vestibular therapy near me in Vancouver',
      topCompetitorInQuery: 'physioworks.ca',
    },
  ],
};

describe('buildGpmReportPdf', () => {
  it('produces a non-empty Uint8Array for a valid payload', async () => {
    const pdf = await buildGpmReportPdf(basePayload);
    expect(pdf).toBeInstanceOf(Uint8Array);
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('PDF starts with the PDF magic bytes %PDF', async () => {
    const pdf = await buildGpmReportPdf(basePayload);
    const header = String.fromCharCode(...Array.from(pdf.slice(0, 4)));
    expect(header).toBe('%PDF');
  });

  it('handles a payload with no competitors', async () => {
    const pdf = await buildGpmReportPdf({ ...basePayload, competitors: [] });
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('handles a payload with no opportunities (all cited)', async () => {
    const pdf = await buildGpmReportPdf({ ...basePayload, opportunities: [] });
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('handles zero visibility pct without throwing', async () => {
    const pdf = await buildGpmReportPdf({
      ...basePayload,
      visibilityPct: 0,
      citationRate: 0,
      industryRank: null,
      prompts: basePayload.prompts.map((p) => ({ ...p, cited: false, rankPosition: null })),
      opportunities: basePayload.prompts.map((p) => ({ queryText: p.queryText, topCompetitorInQuery: null })),
    });
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('handles chatgpt platform label', async () => {
    const pdf = await buildGpmReportPdf({ ...basePayload, platform: 'chatgpt', modelId: 'gpt-4o-mini' });
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('handles perplexity platform label', async () => {
    const pdf = await buildGpmReportPdf({ ...basePayload, platform: 'perplexity', modelId: 'llama-3.1-sonar-small-128k-online' });
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('handles a weekly window date format', async () => {
    const pdf = await buildGpmReportPdf({ ...basePayload, windowDate: '2026-W17' });
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('handles very long query text without throwing', async () => {
    const longQuery = 'What is the best vestibular rehabilitation clinic that specializes in BPPV and post-concussion vestibular therapy for patients with chronic dizziness in greater Vancouver?';
    const pdf = await buildGpmReportPdf({
      ...basePayload,
      prompts: [{ queryKey: 'long-key', queryText: longQuery, cited: true, rankPosition: 3, topCompetitorInQuery: null }],
    });
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('handles many prompts across page boundaries', async () => {
    const manyPrompts = Array.from({ length: 20 }, (_, i) => ({
      queryKey: `query-${String(i)}`,
      queryText: `Test query number ${String(i + 1)} about vestibular rehabilitation in Vancouver BC`,
      cited: i % 3 !== 0,
      rankPosition: i % 3 !== 0 ? (i % 5) + 1 : null,
      topCompetitorInQuery: i % 2 === 0 ? 'competitor.ca' : null,
    }));
    const pdf = await buildGpmReportPdf({ ...basePayload, prompts: manyPrompts });
    expect(pdf.length).toBeGreaterThan(1000);
  });
});
