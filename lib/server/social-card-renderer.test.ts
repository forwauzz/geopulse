import { describe, expect, it, vi } from 'vitest';
import { renderSocialCardSet } from './social-card-renderer';

describe('Jordan social card renderer', () => {
  it('renders a provider-ready 4:5 JPEG and stores immutable metadata', async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const quickAction = vi.fn().mockResolvedValue(
      new Response(new Uint8Array(12_000), {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      })
    );
    const media = await renderSocialCardSet({
      browser: { quickAction },
      bucket: { put },
      publicBase: 'https://assets.example.com/',
      dateKey: '2026-07-24',
      brief: {
        key: 'timely-example',
        kind: 'timely',
        eyebrow: 'What changed',
        headline: 'AI visibility is now measurable',
        supportingText: 'Here is the practical version.',
        sourceLabel: 'Official product documentation',
      },
    });

    expect(quickAction).toHaveBeenCalledWith(
      'screenshot',
      expect.objectContaining({
        viewport: { width: 1080, height: 1350, deviceScaleFactor: 1 },
        screenshotOptions: expect.objectContaining({ type: 'jpeg', quality: 92 }),
      })
    );
    expect(put).toHaveBeenCalledWith(
      'social/jordan/2026-07-24/timely-example-1.jpg',
      expect.any(ArrayBuffer),
      expect.objectContaining({
        httpMetadata: expect.objectContaining({ contentType: 'image/jpeg' }),
      })
    );
    expect(media[0]).toMatchObject({
      storageUrl: 'https://assets.example.com/social/jordan/2026-07-24/timely-example-1.jpg',
      mediaKind: 'image',
      metadata: {
        generated_by: 'jordan',
        width: 1080,
        height: 1350,
        aspect_ratio: '4:5',
      },
    });
  });

  it('renders carousel slides as separate ordered JPEGs', async () => {
    const put = vi.fn().mockResolvedValue(undefined);
    const quickAction = vi.fn().mockImplementation(async () =>
      new Response(new Uint8Array(12_000), { status: 200 })
    );
    const media = await renderSocialCardSet({
      browser: { quickAction },
      bucket: { put },
      publicBase: 'https://assets.example.com',
      dateKey: '2026-07-24',
      brief: {
        key: 'five-checks',
        kind: 'carousel',
        eyebrow: 'Agency checklist',
        headline: 'Three prompts to track',
        supportingText: 'A simple client-ready starting point.',
        bullets: ['Brand discovery', 'Competitor comparison', 'Recommendation intent'],
      },
    });

    expect(media).toHaveLength(5);
    expect(media.every((row) => row.mediaKind === 'carousel_slide')).toBe(true);
    expect(put).toHaveBeenCalledTimes(5);
  });
});
