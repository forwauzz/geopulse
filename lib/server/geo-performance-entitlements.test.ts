import { describe, expect, it } from 'vitest';
import {
  enforceGeoPerformanceLimits,
  resolveGeoPerformanceCaps,
  validateClientBenchmarkConfigInput,
  type ResolvedGeoPerformanceEntitlement,
} from './geo-performance-entitlements';

// ── resolveGeoPerformanceCaps ─────────────────────────────────────────────────

describe('resolveGeoPerformanceCaps', () => {
  it('returns startup_dev caps for startup_dev bundle', () => {
    const caps = resolveGeoPerformanceCaps('startup_dev');
    expect(caps?.tier).toBe('startup_dev');
    expect(caps?.maxPromptsPerRun).toBe(10);
    expect(caps?.allowedCadences).toEqual(['monthly']);
    expect(caps?.deliverySurfaces).toEqual(['email']);
  });

  it('returns agency_core caps with biweekly cadence and slack delivery', () => {
    const caps = resolveGeoPerformanceCaps('agency_core');
    expect(caps?.tier).toBe('agency_core');
    expect(caps?.maxPromptsPerRun).toBe(15);
    expect(caps?.allowedCadences).toContain('biweekly');
    expect(caps?.deliverySurfaces).toContain('slack');
    expect(caps?.deliverySurfaces).not.toContain('portal');
  });

  it('returns agency_pro caps with null prompt limit and all cadences', () => {
    const caps = resolveGeoPerformanceCaps('agency_pro');
    expect(caps?.tier).toBe('agency_pro');
    expect(caps?.maxPromptsPerRun).toBeNull();
    expect(caps?.allowedCadences).toEqual(['monthly', 'biweekly', 'weekly']);
    expect(caps?.deliverySurfaces).toContain('portal');
  });

  it('returns null for startup_lite (no GPM access)', () => {
    expect(resolveGeoPerformanceCaps('startup_lite')).toBeNull();
  });

  it('returns null for null bundle key', () => {
    expect(resolveGeoPerformanceCaps(null)).toBeNull();
  });

  it('returns null for an unknown bundle key', () => {
    expect(resolveGeoPerformanceCaps('unknown_bundle')).toBeNull();
  });
});

// ── validateClientBenchmarkConfigInput ───────────────────────────────────────

describe('validateClientBenchmarkConfigInput', () => {
  const validInput = {
    topic: 'Vestibular Rehabilitation',
    location: 'Vancouver',
    cadence: 'monthly' as const,
    platformsEnabled: ['chatgpt', 'gemini', 'perplexity'],
    benchmarkDomainId: 'domain-uuid',
    startupWorkspaceId: 'workspace-uuid',
    agencyAccountId: null,
  };

  it('passes for a complete valid input', () => {
    const result = validateClientBenchmarkConfigInput(validInput);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('fails when topic is empty', () => {
    const result = validateClientBenchmarkConfigInput({ ...validInput, topic: '' });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('topic is required.');
  });

  it('fails when location is missing', () => {
    const result = validateClientBenchmarkConfigInput({ ...validInput, location: null });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('location'))).toBe(true);
  });

  it('fails when benchmarkDomainId is missing', () => {
    const result = validateClientBenchmarkConfigInput({ ...validInput, benchmarkDomainId: null });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('benchmarkDomainId'))).toBe(true);
  });

  it('fails when neither workspace nor agency is provided', () => {
    const result = validateClientBenchmarkConfigInput({
      ...validInput,
      startupWorkspaceId: null,
      agencyAccountId: null,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('required'))).toBe(true);
  });

  it('fails when both workspace and agency are provided', () => {
    const result = validateClientBenchmarkConfigInput({
      ...validInput,
      startupWorkspaceId: 'ws-uuid',
      agencyAccountId: 'acct-uuid',
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('Only one'))).toBe(true);
  });

  it('fails for an invalid cadence', () => {
    const result = validateClientBenchmarkConfigInput({ ...validInput, cadence: 'daily' });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('cadence'))).toBe(true);
  });

  it('fails when platformsEnabled is empty', () => {
    const result = validateClientBenchmarkConfigInput({ ...validInput, platformsEnabled: [] });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('platform'))).toBe(true);
  });

  it('fails when an unknown platform is included', () => {
    const result = validateClientBenchmarkConfigInput({
      ...validInput,
      platformsEnabled: ['chatgpt', 'unknown_ai'],
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('unknown_ai'))).toBe(true);
  });

  it('accumulates multiple errors', () => {
    const result = validateClientBenchmarkConfigInput({
      topic: '',
      location: '',
      cadence: 'bad',
      platformsEnabled: [],
      benchmarkDomainId: '',
      startupWorkspaceId: null,
      agencyAccountId: null,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(3);
  });
});

// ── enforceGeoPerformanceLimits ───────────────────────────────────────────────

const startupDevEntitlement: ResolvedGeoPerformanceEntitlement = {
  enabled: true,
  tier: 'startup_dev',
  maxPromptsPerRun: 10,
  allowedCadences: ['monthly'],
  deliverySurfaces: ['email'],
  platformsAllowed: ['chatgpt', 'gemini', 'perplexity'],
  source: 'bundle_service',
};

const agencyProEntitlement: ResolvedGeoPerformanceEntitlement = {
  enabled: true,
  tier: 'agency_pro',
  maxPromptsPerRun: null,
  allowedCadences: ['monthly', 'biweekly', 'weekly'],
  deliverySurfaces: ['email', 'slack', 'portal'],
  platformsAllowed: ['chatgpt', 'gemini', 'perplexity'],
  source: 'bundle_service',
};

const disabledEntitlement: ResolvedGeoPerformanceEntitlement = {
  enabled: false,
  tier: null,
  maxPromptsPerRun: null,
  allowedCadences: [],
  deliverySurfaces: [],
  platformsAllowed: [],
  source: 'service_default',
};

describe('enforceGeoPerformanceLimits', () => {
  it('allows a valid config within startup_dev limits', () => {
    const result = enforceGeoPerformanceLimits(startupDevEntitlement, {
      cadence: 'monthly',
      platformsEnabled: ['chatgpt', 'gemini', 'perplexity'],
      promptCount: 10,
    });
    expect(result.allowed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('blocks when cadence is not allowed on the plan', () => {
    const result = enforceGeoPerformanceLimits(startupDevEntitlement, {
      cadence: 'weekly',
      platformsEnabled: ['chatgpt'],
      promptCount: 5,
    });
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.includes('weekly'))).toBe(true);
  });

  it('blocks when prompt count exceeds plan limit', () => {
    const result = enforceGeoPerformanceLimits(startupDevEntitlement, {
      cadence: 'monthly',
      platformsEnabled: ['chatgpt'],
      promptCount: 11,
    });
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.includes('10'))).toBe(true);
  });

  it('allows any prompt count when maxPromptsPerRun is null (agency_pro)', () => {
    const result = enforceGeoPerformanceLimits(agencyProEntitlement, {
      cadence: 'weekly',
      platformsEnabled: ['chatgpt', 'gemini', 'perplexity'],
      promptCount: 999,
    });
    expect(result.allowed).toBe(true);
  });

  it('allows exactly at the prompt limit', () => {
    const result = enforceGeoPerformanceLimits(startupDevEntitlement, {
      cadence: 'monthly',
      platformsEnabled: ['chatgpt'],
      promptCount: 10,
    });
    expect(result.allowed).toBe(true);
  });

  it('blocks when the entitlement is disabled', () => {
    const result = enforceGeoPerformanceLimits(disabledEntitlement, {
      cadence: 'monthly',
      platformsEnabled: ['chatgpt'],
      promptCount: 5,
    });
    expect(result.allowed).toBe(false);
    expect(result.violations.some((v) => v.includes('not enabled'))).toBe(true);
  });

  it('accumulates multiple violations', () => {
    const result = enforceGeoPerformanceLimits(startupDevEntitlement, {
      cadence: 'weekly',
      platformsEnabled: ['chatgpt'],
      promptCount: 20,
    });
    expect(result.allowed).toBe(false);
    expect(result.violations.length).toBeGreaterThanOrEqual(2);
  });
});
