import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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
      join(ROOT, 'lib', 'intelligence', 'buyer-intelligence-assembler.ts'),
      join(ROOT, 'lib', 'intelligence', 'buyer-intelligence-snapshot-change.ts'),
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

  it('retired the approximate report preview and keeps compatibility paths explicitly bounded', () => {
    expect(existsSync(join(ROOT, 'lib', 'server', 'report-preview-payload.ts'))).toBe(false);
    const capabilities = readFileSync(join(ROOT, 'lib', 'server', 'organization-context-capabilities.ts'), 'utf8');
    expect(capabilities).toContain('createBuyerIntelligenceSnapshotRepository');
    expect(capabilities).toContain("kind: 'prospect_preview'");
    expect(capabilities).not.toContain('loadReportPreviewPayload');

    const schedule = readFileSync(join(ROOT, 'lib', 'server', 'geo-performance-schedule.ts'), 'utf8');
    expect(schedule).toContain('legacyArtifactDeliveryEnabled');
    expect(schedule).toContain('GPM_REPORT_DELIVERY_ENABLED');
    const monitor = readFileSync(join(ROOT, 'lib', 'server', 'monitor-subscription.ts'), 'utf8');
    expect(monitor.indexOf('loadCanonicalMonitorSummary')).toBeLessThan(monitor.indexOf('fetchLatestVisibilityForDomain(supabase'));
  });
});
