import Link from 'next/link';
import { AdminLoginForm } from './admin-login-form';

type Props = {
  searchParams?: Promise<{ next?: string }>;
};

export default async function AdminLoginPage(props: Props) {
  const sp = (await props.searchParams) ?? {};
  const nextRaw = typeof sp.next === 'string' ? sp.next : '';
  const nextPath =
    nextRaw.startsWith('/') && !nextRaw.startsWith('//') ? nextRaw : '/dashboard';

  return (
    <main className="mx-auto min-h-[60vh] max-w-lg px-6 py-16">
      <p className="font-label text-sm font-semibold uppercase tracking-widest text-primary">Admin</p>
      <h1 className="mt-2 font-headline text-3xl font-bold text-on-background">Operator sign-in</h1>
      <p className="mt-2 font-body text-on-surface-variant">
        Use the email that matches <code className="rounded bg-surface-container-high px-1.5 py-0.5 text-sm">ADMIN_EMAIL</code>{' '}
        and your Supabase password.
      </p>
      <AdminLoginForm nextPath={nextPath} />
      <p className="mt-8 font-body text-sm text-on-surface-variant">
        <Link href="/" className="font-medium text-tertiary hover:underline">
          ← Back to home
        </Link>
      </p>
    </main>
  );
}
