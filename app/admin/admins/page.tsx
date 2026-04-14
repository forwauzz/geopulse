import { loadAdminPageContext } from '@/lib/server/admin-runtime';
import { addPlatformAdmin, removePlatformAdmin } from './actions';

export const dynamic = 'force-dynamic';

type AdminRow = {
  id: string;
  user_id: string;
  granted_at: string;
  notes: string | null;
  users: {
    email: string | null;
    full_name: string | null;
  } | null;
  granted_by_user: {
    email: string | null;
  } | null;
};

export default async function AdminAdminsPage() {
  const ctx = await loadAdminPageContext('/admin/admins');
  if (!ctx.ok) {
    return <p className="text-sm text-error">{ctx.message}</p>;
  }

  const { data: admins, error } = await ctx.adminDb
    .from('platform_admin_users')
    .select(`
      id,
      user_id,
      granted_at,
      notes,
      users!platform_admin_users_user_id_fkey ( email, full_name ),
      granted_by_user:users!platform_admin_users_granted_by_fkey ( email )
    `)
    .order('granted_at', { ascending: true })
    .returns<AdminRow[]>();

  if (error) {
    const missingTable = /platform_admin_users|relation .* does not exist/i.test(error.message);
    return (
      <div className="space-y-4">
        <h1 className="font-headline text-3xl font-bold text-on-background">Platform admins</h1>
        <p className="text-sm text-error">{error.message}</p>
        {missingTable && (
          <div className="rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
            Apply the admin users migration first:{' '}
            <code>supabase/migrations/036_platform_admin_users.sql</code>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-headline text-3xl font-bold text-on-background">Platform admins</h1>
        <p className="mt-2 font-body text-sm text-on-surface-variant">
          Users with full admin access to this console. This table is the only source of truth for
          platform admin access.
        </p>
      </div>

      {/* Current admins */}
      <section className="space-y-4">
        <h2 className="font-headline text-lg font-semibold text-on-background">
          Current admins ({admins?.length ?? 0})
        </h2>

        {!admins?.length ? (
          <p className="text-sm text-on-surface-variant">
            No admins are seeded yet. Add the first platform admin below.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-outline-variant/20">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant/20 bg-surface-container-low">
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">User</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Granted by</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Granted at</th>
                  <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Notes</th>
                  <th className="px-4 py-3 text-right font-medium text-on-surface-variant">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {admins.map((row) => (
                  <tr key={row.id} className="bg-surface-container-lowest">
                    <td className="px-4 py-3">
                      <p className="font-medium text-on-background">
                        {row.users?.full_name ?? '—'}
                      </p>
                      <p className="text-xs text-on-surface-variant">{row.users?.email ?? '—'}</p>
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">
                      {row.granted_by_user?.email ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">
                      {new Date(row.granted_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-on-surface-variant">{row.notes ?? '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <form action={removePlatformAdmin}>
                        <input type="hidden" name="adminRowId" value={row.id} />
                        <button
                          type="submit"
                          className="rounded-lg border border-error/30 bg-error/5 px-3 py-1 text-xs font-medium text-error transition hover:bg-error/10"
                        >
                          Remove
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Add admin form */}
      <section className="space-y-4">
        <h2 className="font-headline text-lg font-semibold text-on-background">Add platform admin</h2>
        <p className="text-sm text-on-surface-variant">
          The user must already have a GEO-Pulse account (signed up at least once).
        </p>
        <form action={addPlatformAdmin} className="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-medium text-on-surface-variant">
              User email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              placeholder="user@example.com"
              className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-background placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="notes" className="text-xs font-medium text-on-surface-variant">
              Notes (optional)
            </label>
            <input
              id="notes"
              name="notes"
              type="text"
              placeholder="e.g. Co-founder"
              className="rounded-xl border border-outline-variant/40 bg-surface-container-low px-3 py-2 text-sm text-on-background placeholder:text-on-surface-variant/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
          <button
            type="submit"
            className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-on-primary transition hover:opacity-90"
          >
            Add admin
          </button>
        </form>
      </section>
    </div>
  );
}
