import { describe, expect, it } from 'vitest';
import {
  deriveBenchmarkDomainIdentity,
  normalizeBenchmarkDomainValue,
  normalizeBenchmarkSiteUrl,
  toCanonicalBenchmarkDomain,
} from './benchmark-domains';

describe('benchmark domain normalization', () => {
  it('normalizes a site url and strips www for canonical domain', () => {
    const identity = deriveBenchmarkDomainIdentity('https://www.Example.com/path?q=1');

    expect(identity.domain).toBe('www.example.com');
    expect(identity.canonicalDomain).toBe('example.com');
    expect(identity.siteUrl).toBe('https://www.example.com/path?q=1');
  });

  it('prefers explicit fallback domain when provided', () => {
    const identity = deriveBenchmarkDomainIdentity(
      'https://docs.example.com/path',
      'WWW.Acme.test'
    );

    expect(identity.domain).toBe('www.acme.test');
    expect(identity.canonicalDomain).toBe('acme.test');
  });

  it('handles host-like values without protocol', () => {
    expect(normalizeBenchmarkDomainValue('Example.com/products')).toBe('example.com');
    expect(toCanonicalBenchmarkDomain('WWW.Example.com/products')).toBe('example.com');
  });

  it('returns null for empty values', () => {
    expect(normalizeBenchmarkSiteUrl('')).toBeNull();
    expect(normalizeBenchmarkDomainValue(undefined)).toBeNull();
    expect(toCanonicalBenchmarkDomain(null)).toBeNull();
  });
});
