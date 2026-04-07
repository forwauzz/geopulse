import Link from 'next/link';
import { loadAdminPageContext } from '@/lib/server/admin-runtime';

export const dynamic = 'force-dynamic';

type UserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  plan: string | null;
  created_at: string;
};

type SubRow = {
  user_id: string;
  bundle_key: string;
  status: string;
};

export default async function AdminUsersPage() {
  const ctx = await loadAdminPageContext('/admin/users');
  if (!ctx.ok) {
    return <p className="text-sm text-error">{ctx.message}</p>;
  }

  // Load users + their active subscriptions in parallel
  const [usersResult, subsResult] = await Promise.all([
    ctx.adminDb
      .from('users')
      .select('id, email, full_name, plan, created_at')
      .order('created_at', { ascending: false })
      .limit(200)
      .returns<UserRow[]>(),
    ctx.adminDb
      .from('user_subscriptions')
      .select('user_id, bundle_key, status')
      .in('status', ['active', 'trialing', 'past_due'])
      .returns<SubRow[]>(),
  ]);

  if (usersResult.error) {
    return (
      <div className="space-y-4">
        <h1 className="font-headline text-3xl font-bold text-on-background">Users</h1>
        <p className="text-sm text-error">{usersResult.error.message}</p>
      </div>
    );
  }

  const users = usersResult.data ?? [];
  const subs = subsResult.data ?? [];

  // Map user_id → subscriptions
  const subsByUser = new Map<string, SubRow[]>();
  for (const sub of subs) {
    const arr = subsByUser.get(sub.user_id) ?? [];
    arr.push(sub);
    subsByUser.set(sub.user_id, arr);
  }

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      active: 'bg-green-500/10 text-green-700 dark:text-green-400',
      trialing: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
      past_due: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
    };
    return colors[status] ?? 'bg-surface-container text-on-surface-variant';
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline text-3xl font-bold text-on-background">Users</h1>
        <p className="mt-1 text-sm text-on-surface-variant">
          {users.length} users shown (most recent first). Click a user to manage their
          subscriptions and workspaces.
        </p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-outline-variant/20">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-outline-variant/20 bg-surface-container-low">
              <th className="px-4 py-3 text-left font-medium text-on-surface-variant">User</th>
              <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Plan</th>
              <th className="px-4 py-3 text-left font-medium text-on-surface-variant">
                Active subscriptions
              </th>
              <th className="px-4 py-3 text-left font-medium text-on-surface-variant">Joined</th>
              <th className="px-4 py-3 text-right font-medium text-on-surface-variant">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant/10">
            {users.map((u) => {
              const userSubs = subsByUser.get(u.id) ?? [];
              return (
                <tr key={u.id} className="bg-surface-container-lowest">
                  <td className="px-4 py-3">
                    <p className="font-medium text-on-background">{u.full_name ?? '—'}</p>
                    <p className="text-xs text-on-surface-variant">{u.email ?? '—'}</p>
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-lg bg-surface-container px-2 py-0.5 text-xs font-medium text-on-surface-variant">
                      {u.plan ?? 'free'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {userSubs.length === 0 ? (
                      <span className="text-xs text-on-surface-variant/60">None</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {userSubs.map((s) => (
                          <span
                            key={`${s.user_id}-${s.bundle_key}`}
                            className={`rounded-lg px-2 py-0.5 text-xs font-medium ${statusBadge(s.status)}`}
                          >
                            {s.bundle_key} · {s.status}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-on-surface-variant">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/users/${u.id}`}
                      className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-medium text-primary transition hover:bg-primary/10"
                    >
                      Manage →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
