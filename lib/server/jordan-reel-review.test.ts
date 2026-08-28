import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_JORDAN_REEL_REVIEW_MODEL,
  JORDAN_REEL_REVIEW_VERSION,
  parseJordanReelReviewModelPayload,
  reviewJordanReel,
} from './jordan-reel-review';

const script = {
  template: 'diagnostic-kinetic-v1' as const,
  hook: 'CAN CHATGPT FIND YOU',
  tension: 'Your competitors may appear first',
  comparisonTop: 'RANKING',
  comparisonBottom: 'BEING CITED',
  diagnostic: 'CHECK THE VISIBILITY GAP',
  cta: 'RUN A FREE AI VISIBILITY SCAN',
  url: 'getgeopulse.com' as const,
  sourceUrl: 'https://developers.google.com/search/docs/appearance/ai-features',
  sourceLabel: 'Google Search Central',
};

function modelEnvelope(payload: Record<string, unknown>): Response {
  return Response.json({
    candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }],
  });
}

function cleanPayload(overrides: Record<string, unknown> = {}) {
  return {
    decision: 'pass',
    summary: 'The hook, message, CTA, visuals, and audio are clean.',
    hookClear: true,
    brandSafe: true,
    ctaClear: true,
    audioAcceptable: true,
    textReadable: true,
    sequenceCoherent: true,
    engaging: true,
    findings: [],
    ...overrides,
  };
}

describe('Jordan independent Reel review', () => {
  it('rejects malformed or non-timecoded model findings', () => {
    expect(parseJordanReelReviewModelPayload({
      ...cleanPayload(),
      findings: [{ code: 'text_clipped', severity: 'major', message: 'Cut off' }],
    }, 28)).toBeNull();
  });

  it('attests a clean full-video review to the exact media SHA', async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(modelEnvelope(cleanPayload()));

    const review = await reviewJordanReel({
      apiKey: 'gemini-test-key',
      video: new Uint8Array([1, 2, 3]).buffer,
      mediaSha256: 'a'.repeat(64),
      durationSeconds: 28,
      script,
      fetchImpl: fetchImpl as typeof fetch,
      now: new Date('2026-08-24T15:00:00.000Z'),
      wait: async () => undefined,
    });

    expect(review).toMatchObject({
      decision: 'pass',
      reviewer: 'maya',
      provider: 'gemini',
      reviewVersion: JORDAN_REEL_REVIEW_VERSION,
      mediaSha256: 'a'.repeat(64),
      attempts: 1,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain(
      `/models/${DEFAULT_JORDAN_REEL_REVIEW_MODEL}:generateContent`
    );
    const request = JSON.parse(String((fetchImpl.mock.calls[0]?.[1] as RequestInit)?.body));
    expect(request.contents[0].parts[0]).toEqual({
      inlineData: { mimeType: 'video/mp4', data: 'AQID' },
    });
  });

  it('downgrades a claimed pass when the Reel has a serious issue', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(modelEnvelope(cleanPayload({
        decision: 'pass',
        textReadable: false,
        findings: [{
          code: 'text_clipped',
          severity: 'major',
          startSeconds: 3.2,
          endSeconds: 5.1,
          message: 'The headline is clipped at the top.',
          repair: 'Move the headline down into the center safe area.',
        }],
      })));

    const review = await reviewJordanReel({
      apiKey: 'gemini-test-key',
      video: new Uint8Array([1, 2, 3]).buffer,
      mediaSha256: 'b'.repeat(64),
      durationSeconds: 28,
      script,
      fetchImpl: fetchImpl as typeof fetch,
      wait: async () => undefined,
    });

    expect(review.decision).toBe('fail');
    expect(review.findings[0]).toMatchObject({
      startSeconds: 3.2,
      endSeconds: 5.1,
      code: 'text_clipped',
    });
  });

  it('retains the Files API path when inline request size would exceed the safe ceiling', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, {
        status: 200,
        headers: { 'x-goog-upload-url': 'https://upload.example/video' },
      }))
      .mockResolvedValueOnce(Response.json({
        file: { name: 'files/reel-large', uri: 'https://files.example/reel-large', state: 'ACTIVE' },
      }))
      .mockResolvedValueOnce(modelEnvelope(cleanPayload()))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const review = await reviewJordanReel({
      apiKey: 'gemini-test-key',
      video: new Uint8Array(15 * 1024 * 1024).buffer,
      mediaSha256: 'e'.repeat(64),
      durationSeconds: 28,
      script,
      fetchImpl: fetchImpl as typeof fetch,
      wait: async () => undefined,
    });

    expect(review).toMatchObject({ decision: 'pass', attempts: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(String(fetchImpl.mock.calls[0]?.[0])).toContain('/upload/v1beta/files');
    expect(String(fetchImpl.mock.calls[2]?.[0])).toContain('generateContent');
  });

  it('fails closed after two reviewer transport attempts', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
    const review = await reviewJordanReel({
      apiKey: 'gemini-test-key',
      video: new Uint8Array([1, 2, 3]).buffer,
      mediaSha256: 'c'.repeat(64),
      durationSeconds: 28,
      script,
      fetchImpl: fetchImpl as typeof fetch,
      wait: async () => undefined,
    });

    expect(review).toMatchObject({
      decision: 'hold',
      attempts: 2,
      findings: [expect.objectContaining({ code: 'reviewer_unavailable', severity: 'blocker' })],
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('holds the Reel when the reviewer credential is absent', async () => {
    const review = await reviewJordanReel({
      apiKey: '',
      video: new Uint8Array([1, 2, 3]).buffer,
      mediaSha256: 'd'.repeat(64),
      durationSeconds: 28,
      script,
    });
    expect(review).toMatchObject({ decision: 'hold', attempts: 0 });
  });
});
