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
  failJordanReelRender,
} from './jordan-reel-render';
import {
  JORDAN_REEL_REVIEW_VERSION,
  type JordanReelReviewAttestation,
} from './jordan-reel-review';

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

function passingReview(mediaSha256: string): JordanReelReviewAttestation {
  return {
    decision: 'pass' as const,
    reviewer: 'maya' as const,
    reviewVersion: JORDAN_REEL_REVIEW_VERSION,
    provider: 'gemini' as const,
    model: 'gemini-2.5-flash',
    mediaSha256,
    reviewedAt: '2026-07-26T14:29:00.000Z',
    summary: 'Clean and ready.',
    hookClear: true,
    brandSafe: true,
    ctaClear: true,
    audioAcceptable: true,
    textReadable: true,
    sequenceCoherent: true,
    engaging: true,
    findings: [],
    attempts: 1,
  };
}

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

function supabaseStub(recentVideoMetadata: Record<string, unknown>[] = []) {
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
        neq() {
          return chain;
        },
        order() {
          return chain;
        },
        limit: vi.fn(async () => {
          if (table === 'distribution_jobs') {
            return { data: [{ id: 'job-row', publish_mode: 'scheduled', status: 'draft' }] };
          }
          return {
            data: selectValue === 'metadata'
              ? recentVideoMetadata.map((metadata) => ({ metadata }))
              : [],
          };
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

  it('uses the first template absent from the recent rendered set', async () => {
    repo.listAssets.mockResolvedValue([
      asset({ reel_render_status: 'failed', reel_script: script }),
    ]);
    repo.upsertAsset.mockImplementation(async (input) => input);
    const claim = await claimNextJordanReel(
      supabaseStub([
        { template_id: 'diagnostic-kinetic-v1a' },
        { template_id: 'diagnostic-kinetic-v1b' },
        { template_id: 'diagnostic-kinetic-v1a' },
      ]),
      new Date('2026-07-26T14:00:00.000Z')
    );
    expect(claim?.templateId).toBe('diagnostic-kinetic-v1c');
  });

  it('retries the same held Reel after reviewer transport backoff without consuming a new creative slot', async () => {
    repo.listAssets.mockResolvedValue([
      asset({
        reel_render_status: 'review_failed',
        reel_render_retryable: true,
        reel_render_attempt_count: 1,
        reel_template_id: 'diagnostic-kinetic-v1b',
        reel_script: script,
        reel_review_status: 'hold',
        reel_reviewed_at: '2026-07-26T06:00:00.000Z',
        reel_review_summary: 'Reviewer unavailable.',
        reel_review_findings: [{ code: 'reviewer_unavailable' }],
        reel_review_media_sha256: 'held-sha',
        reel_review_attempts: 2,
      }),
    ]);
    repo.upsertAsset.mockImplementation(async (input) => input);

    const claim = await claimNextJordanReel(
      supabaseStub(),
      new Date('2026-07-26T12:01:00.000Z')
    );

    expect(claim).toMatchObject({
      assetId: 'proof_instagram_jordan-reel-2026-07-26-d0',
      templateId: 'diagnostic-kinetic-v1b',
    });
    expect(repo.upsertAsset).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        reel_render_status: 'rendering',
        reel_render_attempt_count: 2,
        reel_review_retry_count: 1,
        reel_review_history: [expect.objectContaining({
          decision: 'hold',
          media_sha256: 'held-sha',
        })],
      }),
    }));
  });

  it('keeps a transient reviewer hold idle until its retry time', async () => {
    repo.listAssets.mockResolvedValue([
      asset({
        reel_render_status: 'review_failed',
        reel_render_retryable: true,
        reel_render_attempt_count: 1,
        reel_template_id: 'diagnostic-kinetic-v1b',
        reel_script: script,
        reel_review_status: 'hold',
        reel_reviewed_at: '2026-07-26T06:00:00.000Z',
        reel_review_retry_after: '2026-07-26T13:00:00.000Z',
        reel_review_findings: [{ code: 'reviewer_unavailable' }],
      }),
    ]);

    await expect(claimNextJordanReel(
      supabaseStub(),
      new Date('2026-07-26T12:59:59.000Z')
    )).resolves.toBeNull();
    expect(repo.upsertAsset).not.toHaveBeenCalled();
  });

  it('does not retry the same media after a substantive Maya review failure', async () => {
    repo.listAssets.mockResolvedValue([
      asset({
        reel_render_status: 'review_failed',
        reel_render_retryable: true,
        reel_render_attempt_count: 1,
        reel_template_id: 'diagnostic-kinetic-v1b',
        reel_script: script,
        reel_review_status: 'fail',
        reel_reviewed_at: '2026-07-26T06:00:00.000Z',
        reel_review_findings: [{ code: 'text_clipped' }],
      }),
    ]);

    await expect(claimNextJordanReel(
      supabaseStub(),
      new Date('2026-07-27T12:00:00.000Z')
    )).resolves.toBeNull();
    expect(repo.upsertAsset).not.toHaveBeenCalled();
  });

  it('reuses the least-recently-used template after every safe variant has appeared', async () => {
    repo.listAssets.mockResolvedValue([
      asset({ reel_render_status: 'failed', reel_script: script, reel_render_attempt_count: 1 }),
    ]);
    repo.upsertAsset.mockImplementation(async (input) => input);
    const claim = await claimNextJordanReel(
      supabaseStub([
        { template_id: 'diagnostic-kinetic-v1a' },
        { template_id: 'diagnostic-kinetic-v1b' },
        { template_id: 'diagnostic-kinetic-v1c' },
      ]),
      new Date('2026-07-26T14:00:00.000Z')
    );
    expect(claim?.templateId).toBe('diagnostic-kinetic-v1c');
    expect(repo.upsertAsset).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        reel_render_status: 'rendering',
        reel_template_id: 'diagnostic-kinetic-v1c',
        reel_render_terminal: false,
      }),
    }));
  });

  it('quarantines an invalid script before any render attempt', async () => {
    repo.listAssets.mockResolvedValue([
      asset({ reel_render_status: 'pending', reel_script: { ...script, sourceUrl: 'invented' } }),
    ]);
    repo.upsertAsset.mockImplementation(async (input) => input);
    const claim = await claimNextJordanReel(
      supabaseStub(),
      new Date('2026-07-26T14:00:00.000Z')
    );
    expect(claim).toBeNull();
    expect(repo.upsertAsset).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        reel_render_status: 'blocked',
        reel_render_error: 'invalid_or_ungrounded_script',
        reel_render_terminal: true,
        reel_render_retryable: false,
      }),
    }));
  });

  it('quarantines duplicate media so the same failed asset cannot be rendered hourly', async () => {
    repo.getAssetByAssetId.mockResolvedValue(asset({
      reel_render_status: 'rendering',
      reel_render_attempt_id: 'attempt-duplicate',
      reel_render_attempt_count: 1,
      reel_script: script,
    }));
    repo.upsertAsset.mockResolvedValue({});
    await failJordanReelRender({
      supabase: supabaseStub(),
      assetId: 'proof_instagram_jordan-reel-2026-07-26-d0',
      attemptId: 'attempt-duplicate',
      error: 'complete_http_422_duplicate_media',
    });
    expect(repo.upsertAsset).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({
        reel_render_status: 'blocked',
        reel_render_terminal: true,
        reel_render_retryable: false,
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
    const mediaSha256 = await crypto.subtle.digest('SHA-256', video).then((digest) =>
      [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    );

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
        durationSeconds: 28,
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
      review: passingReview(mediaSha256),
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
            automated_crop_suite_version: 'jordan-crop-suite-v2',
            production_validation_version: 'jordan-reel-v2',
            validation_version: 'reel-v2',
            agent_review_decision: 'pass',
            agent_review_reviewer: 'maya',
            agent_review_media_sha256: mediaSha256,
          }),
        }),
      ])
    );
    expect(repo.updateJob).toHaveBeenCalledWith('job-row', expect.objectContaining({
      status: 'scheduled',
    }));
    expect(repo.upsertAsset).toHaveBeenCalledWith(expect.objectContaining({
      status: 'approved',
    }));
  });

  it('holds an unavailable Maya review and records a bounded retry time', async () => {
    const renderingAsset = asset({
      reel_render_status: 'rendering',
      reel_render_attempt_id: 'attempt-2',
      reel_template_id: 'diagnostic-kinetic-v1a',
      reel_script: script,
    });
    repo.getAssetByAssetId.mockResolvedValue(renderingAsset);
    repo.replaceAssetMedia.mockResolvedValue([]);
    repo.updateJob.mockResolvedValue({});
    repo.upsertAsset.mockResolvedValue({});
    const video = new Uint8Array(60_000);
    video.set(new TextEncoder().encode('ftyp'), 4);
    const jpeg = new Uint8Array(12_000);
    jpeg[0] = 0xff;
    jpeg[1] = 0xd8;
    const mediaSha256 = await crypto.subtle.digest('SHA-256', video).then((digest) =>
      [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
    );
    const review = {
      ...passingReview(mediaSha256),
      decision: 'hold' as const,
      summary: 'Independent review was unavailable.',
      findings: [{
        code: 'reviewer_unavailable' as const,
        severity: 'blocker' as const,
        startSeconds: 0,
        endSeconds: 0,
        message: 'Independent review was unavailable.',
        repair: 'Retry the independent review before scheduling this exact media file.',
      }],
    };

    const result = await completeJordanReelRender({
      supabase: supabaseStub(),
      bucket: { async put() {} },
      publicBase: 'https://media.example',
      assetId: 'proof_instagram_jordan-reel-2026-07-26-d0',
      attemptId: 'attempt-2',
      video: video.buffer,
      thumbnail: jpeg.buffer.slice(0),
      feedPreview: jpeg.buffer.slice(0),
      gridPreview: jpeg.buffer.slice(0),
      validation: {
        width: 1080,
        height: 1920,
        durationSeconds: 28,
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
      review,
      now: new Date('2026-07-26T14:30:00.000Z'),
    });

    expect(result).toMatchObject({ scheduled: false, reviewDecision: 'hold' });
    expect(repo.updateJob).toHaveBeenCalledWith('job-row', expect.objectContaining({
      status: 'draft',
      lastError: 'reel_agent_review_hold',
    }));
    expect(repo.upsertAsset).toHaveBeenCalledWith(expect.objectContaining({
      status: 'review',
      metadata: expect.objectContaining({
        reel_render_status: 'review_failed',
        reel_review_status: 'hold',
        reel_render_retryable: true,
        reel_review_retry_after: '2026-07-26T20:30:00.000Z',
        reel_review_findings: review.findings,
      }),
    }));
  });
});
