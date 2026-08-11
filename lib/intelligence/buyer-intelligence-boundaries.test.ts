import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(process.cwd());

function sourceFiles(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path)
    .flatMap((name) => sourceFiles(join(path, name)))
    .filter((file) => file.endsWith('.ts') && !file.endsWith('.test.ts'));
}

function imports(path: string): string[] {
  return [...readFileSync(path, 'utf8').matchAll(/from\s+['"]([^'"]+)['"]/g)]
    .map((match) => match[1] ?? '');
}

describe('buyer-intelligence architecture boundaries', () => {
  it('keeps authoritative intelligence independent of CRM provider adapters', () => {
    const violations = sourceFiles(join(ROOT, 'lib', 'intelligence')).flatMap((file) =>
      imports(file)
        .filter((value) => value.includes('/connectors/') || value.startsWith('../connectors'))
        .map((value) => `${relative(ROOT, file)} -> ${value}`)
    );
    expect(violations).toEqual([]);
  });

  it('keeps pure contracts independent of server, worker, app, and provider implementations', () => {
    const contractFiles = [
      join(ROOT, 'lib', 'intelligence', 'buyer-intelligence-contract.ts'),
      join(ROOT, 'lib', 'intelligence', 'buyer-intelligence-projector.ts'),
      join(ROOT, 'lib', 'intelligence', 'buyer-intelligence-questions.ts'),
      join(ROOT, 'lib', 'connectors', 'crm-contract.ts'),
    ];
    const violations = contractFiles.flatMap((file) =>
      imports(file)
        .filter((value) => /(?:^|\/)(?:server|workers|app|providers)(?:\/|$)/.test(value))
        .map((value) => `${relative(ROOT, file)} -> ${value}`)
    );
    expect(violations).toEqual([]);
  });

  it('prevents provider adapters from owning snapshot or rendering logic', () => {
    const providers = join(ROOT, 'lib', 'connectors', 'providers');
    const violations = sourceFiles(providers).flatMap((file) =>
      imports(file)
        .filter((value) => /buyer-intelligence-contract|agency-report-snapshot|build-.*report|report-pdf|workers\/report/.test(value))
        .map((value) => `${relative(ROOT, file)} -> ${value}`)
    );
    expect(violations).toEqual([]);
  });
});
