'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  formatOnboardingMarket,
  onboardingQuestion,
  type OnboardingIntent,
  type OnboardingMissingField,
  type OrganizationOnboardingProposal,
  type ValueFirstOnboardingActionState,
} from '@/lib/intelligence/value-first-onboarding';

type Action = (
  previous: ValueFirstOnboardingActionState | null,
  formData: FormData,
) => Promise<ValueFirstOnboardingActionState>;

type Props = {
  readonly action: Action;
  readonly fixedIntent?: OnboardingIntent;
  readonly defaultIntent?: OnboardingIntent;
  readonly defaultName?: string;
  readonly defaultWebsite?: string;
  readonly hiddenFields?: Readonly<Record<string, string | undefined>>;
  readonly eyebrow?: string;
  readonly title?: string;
  readonly description?: string;
  readonly confirmationLabel?: string;
  readonly confirmationPendingLabel?: string;
};

const ALL_EDITABLE_FIELDS: readonly OnboardingMissingField[] = [
  'display_name',
  'category',
  'country_code',
  'subdivision_code',
  'locality',
  'market_scope',
  'languages',
  'timezone',
];

function SubmitButton({
  confirmation,
  confirmationLabel = 'Confirm and build the baseline',
  confirmationPendingLabel = 'Building the first useful baseline…',
}: {
  readonly confirmation: boolean;
  readonly confirmationLabel?: string;
  readonly confirmationPendingLabel?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-on-primary transition hover:bg-primary-dim disabled:cursor-wait disabled:opacity-65"
    >
      {pending
        ? confirmation
          ? confirmationPendingLabel
          : 'Reading the site for its name, market, and services…'
        : confirmation
          ? confirmationLabel
          : 'Detect business details'}
      {!pending ? <span aria-hidden>→</span> : null}
    </button>
  );
}

function HiddenFields({ values }: { readonly values?: Props['hiddenFields'] }) {
  return Object.entries(values ?? {}).flatMap(([name, value]) => value
    ? [<input key={name} type="hidden" name={name} value={value} />]
    : []);
}

function ConfirmationField({ field, proposal, required = true }: {
  readonly field: OnboardingMissingField;
  readonly proposal: OrganizationOnboardingProposal;
  readonly required?: boolean;
}) {
  const common = 'mt-2 w-full rounded-xl border border-outline-variant/25 bg-surface-container-low px-3 py-2.5 text-sm text-on-background outline-none focus:border-primary';
  if (field === 'market_scope') {
    return (
      <label className="block text-sm text-on-background">
        <span className="font-medium">{onboardingQuestion(field)}</span>
        <select name="marketScope" defaultValue={proposal.marketScope ?? ''} required className={common}>
          <option value="" disabled>Choose one</option>
          <option value="local">Local</option>
          <option value="regional">Regional</option>
          <option value="national">National</option>
          <option value="online">Online</option>
          <option value="global">Global</option>
        </select>
      </label>
    );
  }
  const config = {
    display_name: { name: 'displayName', value: proposal.displayName, placeholder: 'Business name' },
    category: { name: 'category', value: proposal.category ?? '', placeholder: 'e.g. Preventive medicine clinic' },
    country_code: { name: 'countryCode', value: proposal.countryCode ?? '', placeholder: 'Canada or CA' },
    subdivision_code: { name: 'subdivisionCode', value: proposal.subdivisionCode ?? '', placeholder: 'CA-QC or US-NY' },
    locality: { name: 'locality', value: proposal.locality ?? '', placeholder: 'City or local area' },
    languages: { name: 'languages', value: proposal.languages.join(', '), placeholder: 'en-CA, fr-CA' },
    timezone: { name: 'timezone', value: proposal.timezone ?? '', placeholder: 'America/Toronto' },
  } as const;
  const item = config[field];
  return (
    <label className="block text-sm text-on-background">
      <span className="font-medium">{onboardingQuestion(field)}</span>
      <input name={item.name} defaultValue={item.value} placeholder={item.placeholder} required={required} className={common} />
    </label>
  );
}

function ConfirmationStep({
  state,
  action,
  hiddenFields,
  confirmationLabel,
  confirmationPendingLabel,
}: {
  readonly state: Extract<ValueFirstOnboardingActionState, { status: 'needs_confirmation' }>;
  readonly action: (formData: FormData) => void;
  readonly hiddenFields?: Props['hiddenFields'];
  readonly confirmationLabel?: string;
  readonly confirmationPendingLabel?: string;
}) {
  const { proposal } = state;
  const optionalEdits = ALL_EDITABLE_FIELDS.filter((field) => !proposal.missingFields.includes(field));
  return (
    <form action={action} className="space-y-5 rounded-2xl border border-primary/20 bg-surface-container-lowest p-5 shadow-float sm:p-7">
      <input type="hidden" name="confirmed" value="1" />
      <input type="hidden" name="intent" value={proposal.intent} />
      <input type="hidden" name="name" value={proposal.submittedName} />
      <input type="hidden" name="website" value={proposal.submittedWebsite} />
      <HiddenFields values={hiddenFields} />
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Ready to confirm</p>
        <h2 className="mt-2 font-headline text-2xl font-bold text-on-background">Is this the right business and market?</h2>
        <p className="mt-2 text-sm leading-relaxed text-on-surface-variant">
          GEO-Pulse uses this context for buyer questions, competitors, reports, and recurring monitoring. Nothing is sent to a client from this step.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl bg-surface-container-low p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">Business</p>
          <p className="mt-2 font-semibold text-on-background">{proposal.displayName}</p>
          <p className="mt-1 text-sm text-on-surface-variant">{proposal.canonicalDomain}</p>
        </div>
        <div className="rounded-xl bg-surface-container-low p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-on-surface-variant">First market</p>
          <p className="mt-2 font-semibold text-on-background">{formatOnboardingMarket(proposal)}</p>
          <p className="mt-1 text-sm text-on-surface-variant">{proposal.languages.join(', ') || 'Languages need confirmation'}</p>
        </div>
      </div>
      {proposal.missingFields.length > 0 ? (
        <div className="rounded-xl border border-amber-300/50 bg-amber-50 p-4 dark:border-amber-400/20 dark:bg-amber-400/10">
          <p className="text-sm font-semibold text-amber-950 dark:text-amber-100">
            {proposal.missingFields.length === 1 ? 'One detail is missing' : 'A few details are missing'}
          </p>
          <div className="mt-4 grid gap-4">
            {proposal.missingFields.map((field) => <ConfirmationField key={field} field={field} proposal={proposal} />)}
          </div>
        </div>
      ) : (
        <p className="rounded-xl bg-primary/8 px-4 py-3 text-sm text-on-background">The website supplied a complete profile. Confirm it once, then GEO-Pulse can keep the same context everywhere.</p>
      )}
      {/*
        These fields are already answered by the proposal, so they are edits rather
        than questions — marking them required made the browser block submit on a
        field collapsed out of view, which it cannot focus, leaving the button inert
        with no message. Anything genuinely missing is asked above, not hidden here.
      */}
      <details className="rounded-xl border border-outline-variant/20 px-4 py-3">
        <summary className="cursor-pointer text-sm font-semibold text-on-background">Edit detected details</summary>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {optionalEdits.map((field) => <ConfirmationField key={field} field={field} proposal={proposal} required={false} />)}
          <label className="block text-sm text-on-background sm:col-span-2">
            <span className="font-medium">Products or services</span>
            <textarea
              name="services"
              defaultValue={proposal.services.join('\n')}
              rows={3}
              placeholder={'Medical chronology automation\nSource-linked evidence extraction'}
              className="mt-2 w-full rounded-xl border border-outline-variant/25 bg-surface-container-low px-3 py-2.5 text-sm text-on-background outline-none focus:border-primary"
            />
            <span className="mt-1 block text-xs text-on-surface-variant">One per line. These make the recurring buyer questions specific to what the business actually sells.</span>
          </label>
          <label className="block text-sm text-on-background sm:col-span-2">
            <span className="font-medium">Primary buyer</span>
            <input
              name="buyer"
              defaultValue={proposal.buyer ?? ''}
              placeholder="e.g. Plaintiff and defence legal teams"
              className="mt-2 w-full rounded-xl border border-outline-variant/25 bg-surface-container-low px-3 py-2.5 text-sm text-on-background outline-none focus:border-primary"
            />
          </label>
        </div>
      </details>
      <SubmitButton
        confirmation
        confirmationLabel={confirmationLabel}
        confirmationPendingLabel={confirmationPendingLabel}
      />
    </form>
  );
}

export function ValueFirstOnboardingForm({
  action,
  fixedIntent,
  defaultIntent = 'business',
  defaultName = '',
  defaultWebsite = '',
  hiddenFields,
  eyebrow = 'Start with value',
  title = 'See what GEO-Pulse will do before you configure anything',
  description = 'Enter the business name and website. GEO-Pulse detects the market and asks only when something important is unclear.',
  confirmationLabel,
  confirmationPendingLabel,
}: Props) {
  const [state, formAction] = useActionState(action, null);
  if (state?.status === 'needs_confirmation') {
    return (
      <ConfirmationStep
        state={state}
        action={formAction}
        hiddenFields={hiddenFields}
        confirmationLabel={confirmationLabel}
        confirmationPendingLabel={confirmationPendingLabel}
      />
    );
  }
  const draft = state?.status === 'error' ? state.draft : undefined;
  return (
    <form action={formAction} className="space-y-6 rounded-2xl border border-outline-variant/15 bg-surface-container-lowest p-5 shadow-float sm:p-7">
      <HiddenFields values={hiddenFields} />
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">{eyebrow}</p>
        <h2 className="mt-2 font-headline text-2xl font-bold text-on-background">{title}</h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-on-surface-variant">{description}</p>
      </div>
      {!fixedIntent ? (
        <fieldset>
          <legend className="text-sm font-semibold text-on-background">What are you setting up?</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {([
              ['business', 'My business', 'Measure one business and know what to improve first.'],
              ['agency', 'Client work', 'Build held, branded proof before anything is shared.'],
            ] as const).map(([value, label, body]) => (
              <label key={value} className="cursor-pointer rounded-xl border border-outline-variant/20 p-4 transition has-[:checked]:border-primary has-[:checked]:bg-primary/5">
                <input type="radio" name="intent" value={value} defaultChecked={(draft?.intent ?? defaultIntent) === value} required className="sr-only" />
                <span className="block font-semibold text-on-background">{label}</span>
                <span className="mt-1 block text-sm text-on-surface-variant">{body}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : <input type="hidden" name="intent" value={fixedIntent} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm text-on-background">
          <span className="font-medium">Business name</span>
          <input name="name" required defaultValue={draft?.name ?? defaultName} placeholder="Example Clinic" className="mt-2 w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 outline-none focus:border-primary" />
        </label>
        <label className="block text-sm text-on-background">
          <span className="font-medium">Website</span>
          <input name="website" required inputMode="url" defaultValue={draft?.website ?? defaultWebsite} placeholder="example.com" className="mt-2 w-full rounded-xl border border-outline-variant/20 bg-surface-container-low px-4 py-3 outline-none focus:border-primary" />
        </label>
      </div>
      <div className="grid gap-2 text-sm text-on-surface-variant sm:grid-cols-3">
        {['Confirm the right market', 'Build buyer questions', 'Reveal one next action'].map((step, index) => (
          <p key={step} className="flex items-center gap-2 rounded-xl bg-surface-container-low p-3">
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary" aria-hidden>{index + 1}</span>
            {step}
          </p>
        ))}
      </div>
      {state?.status === 'error' ? <p role="alert" className="rounded-xl bg-error/10 px-4 py-3 text-sm text-error">{state.message}</p> : null}
      <SubmitButton confirmation={false} />
    </form>
  );
}
