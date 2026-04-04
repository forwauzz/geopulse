import { describe, expect, it } from 'vitest';
import {
  canTransitionRecommendationStatus,
  createStartupRecommendationsFromMarkdownAudit,
  getStartupRecommendationStatusSummary,
  transitionStartupRecommendationStatus,
} from './startup-recommendation-lifecycle';

function createRecommendationRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'rec-1',
    startup_workspace_id: 'ws-1',
    scan_id: 'scan-1',
    report_id: 'report-1',
    source_kind: 'markdown_audit',
    source_ref: 'audit://row-1',
    title: 'Fix schema gaps',
    summary: 'Add FAQ schema on top pages.',
    team_lane: 'dev',
    priority: 'high',
    status: 'suggested',
    status_changed_at: '2026-04-04T00:00:00.000Z',
    status_reason: null,
    status_updated_by_user_id: null,
    confidence: 0.82,
    evidence: {},
    metadata: {},
    created_by_user_id: 'user-1',
    created_at: '2026-04-04T00:00:00.000Z',
    updated_at: '2026-04-04T00:00:00.000Z',
    ...overrides,
  };
}

describe('startup recommendation lifecycle', () => {
  it('validates transition rules', () => {
    expect(canTransitionRecommendationStatus({ from: 'suggested', to: 'approved' })).toBe(true);
    expect(canTransitionRecommendationStatus({ from: 'approved', to: 'in_progress' })).toBe(true);
    expect(canTransitionRecommendationStatus({ from: 'in_progress', to: 'validated' })).toBe(false);
    expect(canTransitionRecommendationStatus({ from: 'failed', to: 'approved' })).toBe(true);
  });

  it('builds status summary from workspace recommendations', async () => {
    const supabase = {
      from(table: string) {
        expect(table).toBe('startup_recommendations');
        return {
          select() {
            return this;
          },
          eq() {
            return Promise.resolve({
              data: [
                { status: 'suggested' },
                { status: 'approved' },
                { status: 'in_progress' },
                { status: 'shipped' },
                { status: 'validated' },
                { status: 'failed' },
              ],
              error: null,
            });
          },
        };
      },
    } as any;

    const summary = await getStartupRecommendationStatusSummary({
      supabase,
      startupWorkspaceId: 'ws-1',
    });

    expect(summary).toEqual({
      suggested: 1,
      approved: 1,
      inProgress: 1,
      shipped: 1,
      validated: 1,
      failed: 1,
      total: 6,
      open: 4,
    });
  });

  it('applies a valid transition and writes a status event', async () => {
    const base = createRecommendationRow({ status: 'approved' });
    const insertedEvents: Array<Record<string, unknown>> = [];
    const updatedRows: Array<Record<string, unknown>> = [];

    const supabase = {
      from(table: string) {
        if (table === 'startup_recommendations') {
          const state: Record<string, unknown> = {};
          return {
            select() {
              return this;
            },
            eq(field: string, value: unknown) {
              state[field] = value;
              return this;
            },
            maybeSingle() {
              return Promise.resolve({ data: base, error: null });
            },
            update(payload: Record<string, unknown>) {
              updatedRows.push(payload);
              return this;
            },
            limit() {
              return Promise.resolve({
                data: [
                  {
                    ...base,
                    ...updatedRows[0],
                    id: state['id'] ?? base.id,
                  },
                ],
                error: null,
              });
            },
          };
        }

        if (table === 'startup_recommendation_status_events') {
          return {
            insert(payload: Record<string, unknown>) {
              insertedEvents.push(payload);
              return Promise.resolve({ error: null });
            },
          };
        }

        throw new Error(`Unexpected table ${table}`);
      },
    } as any;

    const result = await transitionStartupRecommendationStatus({
      supabase,
      recommendationId: 'rec-1',
      expectedWorkspaceId: 'ws-1',
      toStatus: 'in_progress',
      changedByUserId: 'user-2',
      reason: 'Assigned to sprint',
      metadata: { sprint: '2026-W15' },
    });

    expect(result.status).toBe('in_progress');
    expect(result.statusUpdatedByUserId).toBe('user-2');
    expect(updatedRows).toHaveLength(1);
    expect(insertedEvents).toHaveLength(1);
    expect(insertedEvents[0]?.from_status).toBe('approved');
    expect(insertedEvents[0]?.to_status).toBe('in_progress');
  });

  it('rejects invalid transitions', async () => {
    const supabase = {
      from(table: string) {
        if (table !== 'startup_recommendations') throw new Error(`Unexpected table ${table}`);
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle() {
            return Promise.resolve({
              data: createRecommendationRow({ status: 'suggested' }),
              error: null,
            });
          },
        };
      },
    } as any;

    await expect(
      transitionStartupRecommendationStatus({
        supabase,
        recommendationId: 'rec-1',
        toStatus: 'validated',
      })
    ).rejects.toThrow('Invalid status transition');
  });

  it('maps markdown-audit output into suggested recommendations', async () => {
    const inserted: Array<Record<string, unknown>[]> = [];
    const supabase = {
      from(table: string) {
        expect(table).toBe('startup_recommendations');
        return {
          insert(payload: Array<Record<string, unknown>>) {
            inserted.push(payload);
            return Promise.resolve({ error: null });
          },
        };
      },
    } as any;

    const result = await createStartupRecommendationsFromMarkdownAudit({
      supabase,
      startupWorkspaceId: 'ws-1',
      markdownAuditRef: 'audit://scan-1',
      scanId: 'scan-1',
      items: [
        {
          title: '  Improve robots and sitemap integrity  ',
          priority: 'high',
          teamLane: 'ops',
          confidence: 0.76,
        },
      ],
    });

    expect(result.inserted).toBe(1);
    expect(inserted[0]?.[0]?.status).toBe('suggested');
    expect(inserted[0]?.[0]?.source_kind).toBe('markdown_audit');
    expect(inserted[0]?.[0]?.title).toBe('Improve robots and sitemap integrity');
  });
});
