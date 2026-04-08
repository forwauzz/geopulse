import { describe, expect, it } from 'vitest';
import { ADMIN_PAGE_CONTEXT_MISCONFIGURED_MESSAGE } from './admin-runtime';

describe('admin-runtime', () => {
  it('ADMIN_PAGE_CONTEXT_MISCONFIGURED_MESSAGE matches buildAdminDbOrMessage copy for (admin) layout gate', () => {
    expect(ADMIN_PAGE_CONTEXT_MISCONFIGURED_MESSAGE).toBe(
      'Server misconfigured: missing Supabase service role.',
    );
  });
});
