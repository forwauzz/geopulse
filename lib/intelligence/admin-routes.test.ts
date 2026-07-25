import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const routes = [
  'page.tsx',
  'domains/page.tsx',
  'lanes/page.tsx',
  'windows/page.tsx',
  'evidence/page.tsx',
  'quality/page.tsx',
  'patterns/page.tsx',
] as const;

describe('intelligence admin routes', () => {
  it('keeps every route behind the existing platform-admin context and application contract', () => {
    for (const route of routes) {
      const source = readFileSync(
        resolve(process.cwd(), `app/admin/(console)/intelligence/${route}`),
        'utf8'
      );
      expect(source, route).toContain('loadAdminPageContext');
      expect(source, route).toContain('createIntelligenceAdminData');
      expect(source, route).not.toContain(".from('");
      expect(source, route).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    }
  });

  it('ships no destructive or mutation controls', () => {
    const component = readFileSync(
      resolve(process.cwd(), 'components/intelligence-admin-view.tsx'),
      'utf8'
    );
    for (const operation of ['delete(', 'remove(', '<form', 'action=']) {
      expect(component.toLowerCase()).not.toContain(operation);
    }
  });

  it('does not select raw/private evidence payload fields', () => {
    const contract = readFileSync(
      resolve(process.cwd(), 'lib/intelligence/admin-data.ts'),
      'utf8'
    );
    const evidenceSelection = contract.match(
      /stable_evidence_id,evidence_kind[\s\S]*?extractor_version/
    )?.[0] ?? '';
    expect(evidenceSelection).not.toContain('inline_excerpt');
    expect(evidenceSelection).not.toContain('artifact_ref');
    expect(evidenceSelection).not.toContain('tenant_id');
  });
});
