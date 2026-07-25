import { beforeEach, describe, expect, it, vi } from 'vitest';

const repo = vi.hoisted(() => ({
  listAssets: vi.fn(),
  getAssetByAssetId: vi.fn(),
  upsertAsset: vi.fn(),
  replaceAssetMedia: vi.fn(),
  updateJob: vi.fn(),
}));

vi.mock('./distribution-engine-repository', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./distribution-engine-repository')>();
  return {
    ...actual,
    createDistributionEngineRepository: () => repo,
  };
});

import {
  claimNextJordanReel,
  completeJordanReelRender,
} from './jordan-reel-render';

const script = {
  template: 'diagnostic-kinetic-v1' as const,
  hook: 'AI SEARCH CHANGED',
  tension: 'Ranking and recommendation are different signals',
  comparisonTop: 'RANKING',
  comparisonBottom: 'AI READY',
  diagnostic: 'FIND THE VISIBILITY GAP',
  cta: 'RUN A FREE AI VISIBILITY SCAN',
  url: 'getgeopulse.com' as const,
  sourceUrl: 'https://developers.google.com/search/blog/example',
  sourceLabel: 'Google Search Central',
};

function asset(metadata: Record<string, unknown>) {
  return {
    id: 'asset-row',
    asset_id: 'proof_instagram_jordan-reel-2026-07-26-d0',
    content_item_id: null,
    source_type: 'manual',
    source_key: 'jordan-reel-2026-07-26-d0',
    asset_type: 'short_video_post',
    provider_family: 'instagram',
    title: 'AI search changed',
    body_plaintext: 'Caption',
    caption_text: 'Caption',
    status: 'draft',
    cta_url: 'https://getgeopulse.com/?utm_source=instagram',
    metadata,
    created_at: '2026-07-26T13:00:00.000Z',
  } as never;
}

function supabaseStub() {
  return {
    from(table: string) {
      let selectValue = '';
      const chain = {
        select(value: string) {
          selectValue = value;
          return chain;
        },
        eq() {
          return chain;
        },
        order() {
          return chain;
        },
        limit: vi.fn(async () => {
          if (table === 'distribution_jobs') {
            return { data: [{ id: 'job-row', publish_mode: 'scheduled', status: 'draft' }] };
          }
          return { data: selectValue === 'metadata' ? [] : [] };
        }),
      };
      return chain;
    },
  } as never;
}

describe('Jordan Reel render handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('leases one pending grounded Reel with a rotating template id', async () => {
    repo.listAssets.mockResolvedValue([
      asset({ reel_render_status: 'pending', reel_script: script }),
    ]);
    repo.upsertAsset.mockImplementation(async (input) => input);
    const claim = await claimNextJordanReel(
      supabaseStub(),
      new Date('2026-07-26T14:00:00.000Z')
    );
    expect(claim).toMatchObject({
      assetId: 'proof_instagram_jordan-reel-2026-07-26-d0',
      script,
      templateId: 'diagnostic-kinetic-v1a',
    });
    expect(repo.upsertAsset).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        reel_render_status: 'rendering',
        reel_template_id: 'diagnostic-kinetic-v1a',
      }),
    }));
  });

  it('stores immutable masters and only then promotes the reserved schedule', async () => {
    const renderingAsset = asset({
      reel_render_status: 'rendering',
      reel_render_attempt_id: 'attempt-1',
      reel_template_id: 'diagnostic-kinetic-v1a',
      reel_script: script,
    });
    repo.getAssetByAssetId.mockResolvedValue(renderingAsset);
    repo.replaceAssetMedia.mockResolvedValue([]);
    repo.updateJob.mockResolvedValue({});
    repo.upsertAsset.mockResolvedValue({});
    const puts: string[] = [];
    const video = new Uint8Array(60_000);
    video.set(new TextEncoder().encode('ftyp'), 4);
    const jpeg = new Uint8Array(12_000);
    jpeg[0] = 0xff;
    jpeg[1] = 0xd8;

    const result = await completeJordanReelRender({
      supabase: supabaseStub(),
      bucket: {
        async put(key) {
          puts.push(key);
        },
      },
      publicBase: 'https://media.example',
      assetId: 'proof_instagram_jordan-reel-2026-07-26-d0',
      attemptId: 'attempt-1',
      video: video.buffer,
      thumbnail: jpeg.buffer.slice(0),
      feedPreview: jpeg.buffer.slice(0),
      gridPreview: jpeg.buffer.slice(0),
      validation: {
        width: 1080,
        height: 1920,
        durationSeconds: 9,
        audioTrackCount: 1,
        feedPreviewSafe: true,
        gridPreviewSafe: true,
        reelsPreviewSafe: true,
        mobileTextLegible: true,
        spellingChecked: true,
        ctaChecked: true,
        cropSafeZoneChecked: true,
        templateId: 'diagnostic-kinetic-v1a',
      },
      now: new Date('2026-07-26T14:30:00.000Z'),
    });

    expect(result.scheduled).toBe(true);
    expect(puts).toHaveLength(4);
    expect(puts[0]).toContain('-master.mp4');
    expect(repo.replaceAssetMedia).toHaveBeenCalledWith(
      'asset-row',
      expect.arrayContaining([
        expect.objectContaining({
          mediaKind: 'video',
          metadata: expect.objectContaining({
            automated_crop_suite_approved: true,
            validation_version: 'reel-v2',
          }),
        }),
      ])
    );
    expect(repo.updateJob).toHaveBeenCalledWith('job-row', expect.objectContaining({
      status: 'scheduled',
    }));
  });
});
