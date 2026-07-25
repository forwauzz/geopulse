'use client';

import { useFormStatus } from 'react-dom';

export function PendingSubmitButton({
  idleLabel,
  pendingLabel,
  icon = 'refresh',
  className,
}: {
  readonly idleLabel: string;
  readonly pendingLabel: string;
  readonly icon?: string;
  readonly className: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button disabled={pending} className={`${className} disabled:cursor-wait disabled:opacity-65`}>
      <span className={`material-symbols-outlined text-[18px] ${pending ? 'animate-spin' : ''}`} aria-hidden>
        {pending ? 'progress_activity' : icon}
      </span>
      {pending ? pendingLabel : idleLabel}
    </button>
  );
}
