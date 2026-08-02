import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { loadWranglerBuildVars } = require('./wrangler-build-vars.cjs') as {
  loadWranglerBuildVars: (root: string, configFile?: string) => Record<string, string>;
};

describe('loadWranglerBuildVars', () => {
  it('loads scalar vars while excluding bindings and structured values', () => {
    const root = mkdtempSync(join(tmpdir(), 'geopulse-wrangler-vars-'));
    writeFileSync(
      join(root, 'wrangler.jsonc'),
      `{
        // URLs contain // and must remain intact.
        "vars": {
          "NEXT_PUBLIC_APP_URL": "https://getgeopulse.com/",
          "FEATURE_ENABLED": true,
          "BATCH_LIMIT": 20,
          "STRUCTURED": { "unsafe": true }
        },
        "ai": { "binding": "AI" },
        "browser": { "binding": "BROWSER" },
        "kv_namespaces": [{ "binding": "SCAN_CACHE", "id": "not-a-build-var" }]
      }`
    );

    expect(loadWranglerBuildVars(root)).toEqual({
      NEXT_PUBLIC_APP_URL: 'https://getgeopulse.com/',
      FEATURE_ENABLED: 'true',
      BATCH_LIMIT: '20',
    });
  });

  it('returns an empty object when no vars block exists', () => {
    const root = mkdtempSync(join(tmpdir(), 'geopulse-wrangler-vars-'));
    writeFileSync(join(root, 'wrangler.jsonc'), '{ "name": "geo-pulse" }');
    expect(loadWranglerBuildVars(root)).toEqual({});
  });
});
