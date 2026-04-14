import { describe, expect, it } from 'vitest';
import { seedTopicPageItems } from './content-topic-page-admin';

describe('seedTopicPageItems', () => {
  it('creates one research-note topic page per article topic cluster', async () => {
    const inserts: Array<Record<string, unknown>> = [];

    const supabase = {
      from(table: string) {
        if (table !== 'content_items') throw new Error(`Unexpected table: ${table}`);
        return {
          select(selection?: string) {
            void selection;
            return this;
          },
          eq(column: string, value: string) {
            if (column === 'content_type' && value === 'article') {
              return Promise.resolve({
                data: [{ topic_cluster: 'ai_search_readiness' }, { topic_cluster: 'citation_readiness' }],
                error: null,
              });
            }
            if (column === 'content_id') {
              return this;
            }
            return this;
          },
          limit() {
            return Promise.resolve({ data: [], error: null });
          },
          insert(payload: Record<string, unknown>) {
            inserts.push(payload);
            return Promise.resolve({ error: null });
          },
          update() {
            return this;
          },
        };
      },
    } as any;

    const result = await seedTopicPageItems(supabase, 'user-1');

    expect(result).toEqual({
      seededCount: 2,
      topicKeys: ['ai_search_readiness', 'citation_readiness'],
    });
    expect(inserts).toHaveLength(2);
    expect(inserts[0]?.content_type).toBe('research_note');
    expect(inserts[0]?.content_id).toBe('topic-page-ai_search_readiness');
  });
});
