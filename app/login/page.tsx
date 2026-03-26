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
    <main className="mx-auto flex min-h-[60vh] max-w-lg flex-col px-6 py-16">
      <Link href="/" className="font-body text-sm font-semibold text-tertiary hover:underline">
        ← Back to GEO-Pulse
      </Link>
      <h1 className="mt-8 font-headline text-3xl font-bold tracking-tight text-on-background md:text-4xl">Sign in</h1>
      <p className="mt-2 font-body text-on-surface-variant">
        We&apos;ll email you a magic link — no password. Use the same email as checkout to see your reports.
      </p>
      {err ? (
        <p className="mt-4 rounded-xl border border-error/30 bg-surface-container-low px-4 py-3 font-body text-sm text-error">
          {decodeURIComponent(err)}
        </p>
      ) : null}
      <LoginForm nextPath={nextPath} />
    </main>
  );
}
