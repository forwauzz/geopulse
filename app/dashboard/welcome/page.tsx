import { redirect } from 'next/navigation';
import { ValueFirstOnboardingForm } from '@/components/value-first-onboarding-form';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { completeWelcome } from './actions';

export const dynamic = 'force-dynamic';

export default async function WelcomePage({
  searchParams,
}: {
  readonly searchParams?: Promise<{
    bundle?: string;
    autosubscribe?: string;
    organization_name?: string;
    website_url?: string;
    qa_token?: string;
  }>;
}) {
  const sp = (await searchParams) ?? {};
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/welcome');

  const defaultIntent = sp.bundle === 'agency_core' || sp.bundle === 'agency_pro'
    ? 'agency'
    : 'business';
  return (
    <div className="mx-auto max-w-3xl py-5 sm:py-8">
      <header className="mb-6 text-center sm:mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Welcome to GEO-Pulse</p>
        <h1 className="mt-3 font-headline text-3xl font-bold text-on-background sm:text-4xl">Get to a useful answer first</h1>
        <p className="mx-auto mt-3 max-w-2xl text-on-surface-variant">You do not need to understand GEO tools. Start with the business and website; GEO-Pulse will explain what it found before measuring anything.</p>
      </header>
      <ValueFirstOnboardingForm
        action={completeWelcome}
        defaultIntent={defaultIntent}
        defaultName={sp.organization_name ?? ''}
        defaultWebsite={sp.website_url ?? ''}
        hiddenFields={{
          bundle: sp.bundle,
          autosubscribe: sp.autosubscribe,
          qa_token: sp.qa_token,
        }}
      />
    </div>
  );
}
