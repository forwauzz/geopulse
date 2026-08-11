import { beforeEach, describe, expect, it, vi } from 'vitest';

const revalidatePath = vi.fn();
const loadAdminActionContext = vi.fn();
const createServiceRoleClient = vi.fn();

vi.mock('next/cache', () => ({ revalidatePath }));
vi.mock('@/lib/server/admin-runtime', () => ({ loadAdminActionContext }));
vi.mock('@/lib/supabase/service-role', () => ({ createServiceRoleClient }));

function createAdminDb(existingUserId: string | null) {
  const membershipInserts: unknown[] = [];

  return {
    membershipInserts,
    from(table: string) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle() {
          if (table === 'users') {
            return Promise.resolve({
              data: existingUserId ? { id: existingUserId, email: 'partner@example.com' } : null,
              error: null,
            });
          }
          return Promise.resolve({ data: null, error: null });
        },
        insert(payload: unknown) {
          if (table === 'agency_users') membershipInserts.push(payload);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
}

function agencyUserForm(password?: string) {
  const form = new FormData();
  form.set('agencyAccountId', '11111111-1111-4111-8111-111111111111');
  form.set('email', 'Partner@Example.com');
  form.set('role', 'owner');
  if (password) form.set('password', password);
  return form;
}

describe('agency user administration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('assigns an existing user without changing authentication credentials', async () => {
    const adminDb = createAdminDb('user-existing');
    loadAdminActionContext.mockResolvedValue({ ok: true, adminDb, env: {} });
    const { createAgencyUser } = await import('./actions');

    await expect(createAgencyUser(null, agencyUserForm())).resolves.toEqual({
      ok: true,
      message: 'Agency user saved.',
    });

    expect(createServiceRoleClient).not.toHaveBeenCalled();
    expect(adminDb.membershipInserts).toEqual([
      {
        agency_account_id: '11111111-1111-4111-8111-111111111111',
        user_id: 'user-existing',
        role: 'owner',
        status: 'active',
        metadata: { source: 'admin_manual' },
      },
    ]);
    expect(revalidatePath).toHaveBeenCalledWith('/dashboard/agencies');
  });

  it('requires an initial password only when the email has no existing user', async () => {
    const adminDb = createAdminDb(null);
    loadAdminActionContext.mockResolvedValue({ ok: true, adminDb, env: {} });
    const { createAgencyUser } = await import('./actions');

    await expect(createAgencyUser(null, agencyUserForm())).resolves.toEqual({
      ok: false,
      message: 'Password must be at least 8 characters for a new user.',
    });

    expect(createServiceRoleClient).not.toHaveBeenCalled();
    expect(adminDb.membershipInserts).toHaveLength(0);
  });

  it('creates a new login before assigning its agency membership', async () => {
    const adminDb = createAdminDb(null);
    const createUser = vi.fn().mockResolvedValue({
      data: { user: { id: 'user-new' } },
      error: null,
    });
    createServiceRoleClient.mockReturnValue({ auth: { admin: { createUser } } });
    loadAdminActionContext.mockResolvedValue({
      ok: true,
      adminDb,
      env: {
        NEXT_PUBLIC_SUPABASE_URL: 'https://project.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'test-key',
      },
    });
    const { createAgencyUser } = await import('./actions');

    await expect(createAgencyUser(null, agencyUserForm('safe-password'))).resolves.toEqual({
      ok: true,
      message: 'Agency user saved.',
    });

    expect(createUser).toHaveBeenCalledWith({
      email: 'partner@example.com',
      password: 'safe-password',
      email_confirm: true,
    });
    expect(adminDb.membershipInserts).toEqual([
      expect.objectContaining({ user_id: 'user-new', role: 'owner' }),
    ]);
  });
});
