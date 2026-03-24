import Link from 'next/link';
import { LoginForm } from './login-form';

type Props = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

function safeNextPath(raw: string | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) {
    return '/dashboard';
  }
  return raw;
}

export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const nextPath = safeNextPath(sp.next);
  const err = sp.error;

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col px-6 py-16">
      <Link href="/" className="text-sm font-semibold text-geo-accent hover:underline">
        ← Back to GEO-Pulse
      </Link>
      <h1 className="mt-8 text-3xl font-bold tracking-tight text-geo-ink">Sign in</h1>
      <p className="mt-2 text-geo-mist">
        We&apos;ll email you a magic link — no password. Use the same email as checkout to see your
        reports.
      </p>
      {err ? (
        <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {decodeURIComponent(err)}
        </p>
      ) : null}
      <LoginForm nextPath={nextPath} />
    </main>
  );
}
