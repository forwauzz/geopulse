import { describe, expect, it } from 'vitest';
import { MAX_DEEP_AUDIT_PAGE_LIMIT, resolveDefaultDeepAuditPageLimit } from './deep-audit-page-limit';

describe('resolveDefaultDeepAuditPageLimit', () => {
  it('defaults to 10 when empty', () => {
    expect(resolveDefaultDeepAuditPageLimit(undefined)).toBe(10);
    expect(resolveDefaultDeepAuditPageLimit('')).toBe(10);
    expect(resolveDefaultDeepAuditPageLimit('  ')).toBe(10);
  });

  it('parses valid integers', () => {
    expect(resolveDefaultDeepAuditPageLimit('25')).toBe(25);
    expect(resolveDefaultDeepAuditPageLimit('1')).toBe(1);
  });

  it('caps at MAX_DEEP_AUDIT_PAGE_LIMIT', () => {
    expect(resolveDefaultDeepAuditPageLimit(String(MAX_DEEP_AUDIT_PAGE_LIMIT + 50))).toBe(MAX_DEEP_AUDIT_PAGE_LIMIT);
  });

  it('rejects invalid values', () => {
    expect(resolveDefaultDeepAuditPageLimit('0')).toBe(10);
    expect(resolveDefaultDeepAuditPageLimit('nope')).toBe(10);
  });
});
