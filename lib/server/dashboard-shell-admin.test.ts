import { describe, expect, it } from 'vitest';
import { resolveDashboardShellIsAdmin } from './dashboard-shell-admin';

describe('resolveDashboardShellIsAdmin', () => {
  it('returns true when DB platform admin is true', () => {
    expect(resolveDashboardShellIsAdmin(true)).toBe(true);
  });

  it('returns false when neither DB nor legacy admin', () => {
    expect(resolveDashboardShellIsAdmin(false)).toBe(false);
  });
});
