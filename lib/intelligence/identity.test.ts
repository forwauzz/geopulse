import { describe, expect, it } from 'vitest';
import {
  IDENTITY_NORMALIZATION_VERSION,
  findIdentityCollisions,
  normalizeDomainIdentity,
  normalizePageIdentity,
  planIdentity,
  validIdentityOwner,
} from './identity';

describe('canonical intelligence identity', () => {
  it.each([
    ['Example.COM', 'example.com'],
    ['https://www.example.com/path', 'example.com'],
    ['http://example.com:80', 'example.com'],
    ['https://example.com.', 'example.com'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizeDomainIdentity(input)).toEqual({
      ok: true,
      value: {
        normalizedHost: expected,
        observedHost: expect.any(String),
        normalizationVersion: IDENTITY_NORMALIZATION_VERSION,
      },
    });
  });

  it('preserves subdomains rather than silently merging properties', () => {
    expect(normalizeDomainIdentity('docs.example.com')).toMatchObject({
      ok: true,
      value: { normalizedHost: 'docs.example.com' },
    });
  });

  it('normalizes pages deterministically while retaining the original URL', () => {
    expect(normalizePageIdentity('HTTP://WWW.Example.com//Docs/?b=2&a=1#part')).toEqual({
      ok: true,
      value: {
        normalizedUrl: 'https://example.com/Docs?a=1&b=2',
        originalUrl: 'HTTP://WWW.Example.com//Docs/?b=2&a=1#part',
        normalizedHost: 'example.com',
        normalizationVersion: IDENTITY_NORMALIZATION_VERSION,
      },
    });
  });

  it.each(['', 'localhost', '127.0.0.1', 'ftp://example.com'])(
    'returns an explicit unmapped reason for %s',
    (input) => {
      expect(planIdentity({
        sourceKind: 'scan',
        sourceId: 'one',
        sourceTable: 'scans',
        domainInput: input,
      }).status).toBe('unmapped');
    }
  );

  it('reports shared-host candidates for review without merging them', () => {
    const collisions = findIdentityCollisions([
      planIdentity({ sourceKind: 'scan', sourceId: '1', sourceTable: 'scans', domainInput: 'example.com' }),
      planIdentity({ sourceKind: 'benchmark_domain', sourceId: '2', sourceTable: 'benchmark_domains', domainInput: 'www.example.com' }),
    ]);
    expect(collisions.get('example.com')).toEqual(['example.com', 'www.example.com']);
  });

  it('does not invent tenant ownership for ownerless historical records', () => {
    expect(validIdentityOwner({
      sourceKind: 'recurring_schedule',
      sourceId: 'legacy',
      sourceTable: 'recurring_audit_schedules',
      ownerType: 'user',
      ownerId: null,
    })).toBeNull();
    expect(validIdentityOwner({
      sourceKind: 'benchmark_domain',
      sourceId: 'benchmark',
      sourceTable: 'benchmark_domains',
      ownerType: 'internal_benchmark',
      ownerId: null,
    })).toEqual({ ownerType: 'internal_benchmark', ownerId: null });
  });
});
