import { describe, expect, it } from 'vitest';
import {
  appendContentPublishCheckSnapshot,
  buildContentPublishQualityTrendSummary,
  readContentPublishCheckHistory,
} from './content-publish-check-history';
import type { ContentPublishCheck } from './content-publishing';

describe('content publish check history', () => {
  it('appends a snapshot with failed hints and counts', () => {
    const checks: ContentPublishCheck[] = [
      {
        key: 'title',
        label: 'Title is present',
        category: 'publish_contract',
        passed: true,
      },
      {
        key: 'llm_internal_blog_link',
        label: 'Includes internal blog link',
        category: 'llm_readiness',
        passed: false,
        hint: 'Add at least one internal /blog link in the article body for topic graph clarity.',
      },
    ];

    const next = appendContentPublishCheckSnapshot({}, checks);
    const history = readContentPublishCheckHistory(next);

    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      passed: false,
      total_checks: 2,
      failed_count: 1,
      failed_keys: ['llm_internal_blog_link'],
      failed_hints: ['Add at least one internal /blog link in the article body for topic graph clarity.'],
      category_totals: {
        publish_contract: 1,
        llm_readiness: 1,
      },
    });
  });

  it('keeps only the latest 20 snapshots', () => {
    let metadata: Record<string, unknown> = {};
    const checks: ContentPublishCheck[] = [
      {
        key: 'title',
        label: 'Title is present',
        category: 'publish_contract',
        passed: true,
      },
    ];

    for (let index = 0; index < 25; index += 1) {
      metadata = appendContentPublishCheckSnapshot(metadata, checks);
    }

    const history = readContentPublishCheckHistory(metadata);
    expect(history).toHaveLength(20);
  });

  it('builds compact cross-article trends and regression flags', () => {
    const rows = [
      {
        content_id: 'a1',
        title: 'Article A',
        status: 'draft',
        metadata: {
          publish_check_history: [
            {
              checked_at: '2026-04-03T12:00:00.000Z',
              passed: false,
              total_checks: 5,
              failed_count: 2,
              failed_keys: ['llm_internal_blog_link', 'claim_source_alignment'],
              failed_hints: [],
              category_totals: { llm_readiness: 3, semantic: 2 },
            },
            {
              checked_at: '2026-04-02T12:00:00.000Z',
              passed: false,
              total_checks: 5,
              failed_count: 1,
              failed_keys: ['llm_internal_blog_link'],
              failed_hints: [],
              category_totals: { llm_readiness: 3, semantic: 2 },
            },
          ],
        },
      },
      {
        content_id: 'b1',
        title: 'Article B',
        status: 'review',
        metadata: {
          publish_check_history: [
            {
              checked_at: '2026-04-03T10:00:00.000Z',
              passed: false,
              total_checks: 4,
              failed_count: 1,
              failed_keys: ['llm_internal_blog_link'],
              failed_hints: [],
              category_totals: { llm_readiness: 2, publish_contract: 2 },
            },
            {
              checked_at: '2026-04-02T10:00:00.000Z',
              passed: true,
              total_checks: 4,
              failed_count: 0,
              failed_keys: [],
              failed_hints: [],
              category_totals: { llm_readiness: 2, publish_contract: 2 },
            },
          ],
        },
      },
      {
        content_id: 'c1',
        title: 'Article C',
        status: 'review',
        metadata: {
          publish_check_history: [
            {
              checked_at: '2026-04-03T08:00:00.000Z',
              passed: true,
              total_checks: 3,
              failed_count: 0,
              failed_keys: [],
              failed_hints: [],
              category_totals: { publish_contract: 3 },
            },
            {
              checked_at: '2026-04-02T08:00:00.000Z',
              passed: false,
              total_checks: 3,
              failed_count: 2,
              failed_keys: ['author_name', 'author_role'],
              failed_hints: [],
              category_totals: { publish_contract: 3 },
            },
          ],
        },
      },
    ] as const;

    const summary = buildContentPublishQualityTrendSummary(rows);

    expect(summary).toMatchObject({
      articles_with_history: 3,
      failing_articles: 2,
      regressions: 2,
      improvements: 1,
      latest_checked_at: '2026-04-03T12:00:00.000Z',
      top_failed_keys: [
        { key: 'llm_internal_blog_link', count: 2 },
        { key: 'claim_source_alignment', count: 1 },
      ],
    });
    expect(summary.regression_flags).toHaveLength(2);
    expect(summary.regression_flags[0]).toMatchObject({
      content_id: 'a1',
      failed_count: 2,
      previous_failed_count: 1,
      newly_failed_keys: ['claim_source_alignment'],
    });
  });
});
