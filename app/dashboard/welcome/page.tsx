import { redirect } from 'next/navigation';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { completeWelcome } from './actions';

export const dynamic = 'force-dynamic';

export default async function WelcomePage({
  searchParams,
}: {
  readonly searchParams?: Promise<{ error?: string }>;
}) {
  const sp = (await searchParams) ?? {};
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=/dashboard/welcome');

  return (
    <div className="mx-auto max-w-2xl py-6">
      <header className="text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">Welcome to GEO-Pulse</p>
        <h1 className="mt-3 font-headline text-3xl font-bold text-on-background">What should GEO-Pulse help you grow?</h1>
        <p className="mx-auto mt-3 max-w-xl text-on-surface-variant">Two quick choices personalize your workspace. You can change them later.</p>
      </header>
      <form action={completeWelcome} className="mt-8 space-y-7 rounded-2xl border border-outline-variant/10 bg-surface-container-lowest p-6 shadow-float sm:p-8">
        <fieldset>
          <legend className="font-semibold text-on-background">1. Which best describes you?</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {[
              ['business', 'My own business', 'Track one brand and improve its AI visibility.', 'storefront'],
              ['agency', 'Marketing agency', 'Manage clients and send branded reports.', 'groups'],
            ].map(([value, title, body, icon]) => (
              <label key={value} className="cursor-pointer rounded-xl border border-outline-variant/20 p-4 transition has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input type="radio" name="role" value={value} required className="sr-only" />
                <span className="material-symbols-outlined text-primary" aria-hidden>{icon}</span>
                <span className="mt-3 block font-semibold text-on-background">{title}</span>
                <span className="mt-1 block text-sm text-on-surface-variant">{body}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="font-semibold text-on-background">2. What matters most right now?</legend>
          <div className="mt-3 space-y-2">
            {[
              ['visibility', 'Show up more often in ChatGPT and AI search'],
              ['competitors', 'See how I compare with competitors'],
              ['reports', 'Create clear reports that prove progress'],
            ].map(([value, label]) => (
              <label key={value} className="flex cursor-pointer items-center gap-3 rounded-xl border border-outline-variant/20 px-4 py-3 transition has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input type="radio" name="goal" value={value} required className="h-4 w-4 accent-primary" />
                <span className="text-sm font-medium text-on-background">{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <label className="block">
          <span className="font-semibold text-on-background">Website <span className="font-normal text-on-surface-variant">(optional)</span></span>
          <input name="website" type="text" inputMode="url" placeholder="yourbusiness.com" className="mt-3 w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-on-background outline-none focus:border-primary" />
        </label>
        {sp.error ? <p className="rounded-xl bg-error/10 px-4 py-3 text-sm text-error">We could not save those choices. Please try again.</p> : null}
        <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-on-primary">
          Continue <span className="material-symbols-outlined text-[18px]" aria-hidden>arrow_forward</span>
        </button>
      </form>
    </div>
  );
}
