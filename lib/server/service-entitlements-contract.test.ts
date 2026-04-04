import { describe, expect, it } from 'vitest';
import {
  BUNDLE_KEYS,
  LEGACY_AGENCY_FLAG_TO_SERVICE_KEY,
  SERVICE_KEYS,
  isBundleKey,
  isServiceKey,
} from './service-entitlements-contract';

describe('service-entitlements-contract', () => {
  it('has unique service keys', () => {
    expect(new Set(SERVICE_KEYS).size).toBe(SERVICE_KEYS.length);
  });

  it('has unique bundle keys', () => {
    expect(new Set(BUNDLE_KEYS).size).toBe(BUNDLE_KEYS.length);
  });

  it('recognizes service keys and bundle keys', () => {
    expect(isServiceKey('free_scan')).toBe(true);
    expect(isServiceKey('unknown')).toBe(false);
    expect(isBundleKey('startup_dev')).toBe(true);
    expect(isBundleKey('enterprise_max')).toBe(false);
  });

  it('maps legacy agency flags to valid service keys', () => {
    for (const serviceKey of Object.values(LEGACY_AGENCY_FLAG_TO_SERVICE_KEY)) {
      expect(SERVICE_KEYS).toContain(serviceKey);
    }
  });
});
