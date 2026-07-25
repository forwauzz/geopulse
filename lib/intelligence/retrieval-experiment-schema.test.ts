import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/065_intelligence_retrieval_experiment.sql'),
  'utf8'
);

describe('retrieval experiment schema', () => {
  it('stores versioned manifests and measured results without making vectors canonical', () => {
    expect(migration).toContain('intelligence_retrieval_experiments');
    expect(migration).toContain('intelligence_embedding_manifests');
    expect(migration).toContain('intelligence_retrieval_task_results');
    expect(migration).toContain('source_text_hash');
    expect(migration).toContain('recommendation');
    expect(migration).not.toContain('vector(');
    expect(migration).not.toContain('raw_text');
    expect(migration).toContain('ENABLE ROW LEVEL SECURITY');
  });
});
