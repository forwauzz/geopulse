import { describe, expect, it } from 'vitest';
import { hashEmailSha256, normalizeEmail, canonicalizeSource } from './hash';

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail('  User@Example.COM  ')).toBe('user@example.com');
  });

  it('handles already-normalized input', () => {
    expect(normalizeEmail('user@example.com')).toBe('user@example.com');
  });
});

describe('hashEmailSha256', () => {
  it('produces 64-char hex string', async () => {
    const hash = await hashEmailSha256('user@example.com');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces consistent output for same input', async () => {
    const a = await hashEmailSha256('test@geo-pulse.io');
    const b = await hashEmailSha256('test@geo-pulse.io');
    expect(a).toBe(b);
  });

  it('normalizes before hashing — case insensitive', async () => {
    const lower = await hashEmailSha256('user@example.com');
    const upper = await hashEmailSha256('USER@EXAMPLE.COM');
    expect(lower).toBe(upper);
  });

  it('normalizes before hashing — trims whitespace', async () => {
    const clean = await hashEmailSha256('user@example.com');
    const padded = await hashEmailSha256('  user@example.com  ');
    expect(clean).toBe(padded);
  });

  it('produces different hashes for different emails', async () => {
    const a = await hashEmailSha256('alice@example.com');
    const b = await hashEmailSha256('bob@example.com');
    expect(a).not.toBe(b);
  });
});

describe('canonicalizeSource', () => {
  it('maps twitter variants to x', () => {
    expect(canonicalizeSource('twitter')).toBe('x');
    expect(canonicalizeSource('Twitter')).toBe('x');
    expect(canonicalizeSource('twitter.com')).toBe('x');
    expect(canonicalizeSource('x.com')).toBe('x');
    expect(canonicalizeSource('t.co')).toBe('x');
  });

  it('maps linkedin variants', () => {
    expect(canonicalizeSource('linkedin.com')).toBe('linkedin');
    expect(canonicalizeSource('lnkd.in')).toBe('linkedin');
  });

  it('maps facebook variants', () => {
    expect(canonicalizeSource('facebook.com')).toBe('facebook');
    expect(canonicalizeSource('fb.com')).toBe('facebook');
  });

  it('passes through unknown sources unchanged', () => {
    expect(canonicalizeSource('newsletter')).toBe('newsletter');
    expect(canonicalizeSource('google')).toBe('google');
  });

  it('trims and lowercases', () => {
    expect(canonicalizeSource('  Google  ')).toBe('google');
  });
});
