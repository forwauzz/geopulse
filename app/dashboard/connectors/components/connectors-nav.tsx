import Link from 'next/link';

export type ConnectorTabId = 'github' | 'slack';

type ConnectorNavItem = {
  readonly id: ConnectorTabId;
  readonly label: string;
  readonly icon: string;
  readonly enabled: boolean;
};

type Props = {
  readonly workspaceQuery: string;
  readonly active: ConnectorTabId;
  readonly items: readonly ConnectorNavItem[];
};

function hrefFor(workspaceQuery: string, id: ConnectorTabId): string {
  const q = new URLSearchParams(workspaceQuery);
  q.set('connector', id);
  const s = q.toString();
  return s ? `/dashboard/connectors?${s}` : '/dashboard/connectors';
}

export function ConnectorsNav({ workspaceQuery, active, items }: Props) {
  return (
    <aside className="flex w-full shrink-0 flex-col rounded-2xl border border-outline-variant/10 bg-surface-container-low lg:w-[min(100%,17.5rem)]">
      <div className="flex items-center justify-between gap-2 border-b border-outline-variant/10 px-4 py-3.5">
        <h2 className="font-headline text-sm font-semibold tracking-tight text-on-background">Connectors</h2>
        <span className="material-symbols-outlined text-[20px] text-on-surface-variant" aria-hidden>
          tune
        </span>
      </div>

      <nav className="flex-1 space-y-1 p-2" aria-label="Connector integrations">
        <details className="group rounded-xl" open>
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant marker:hidden [&::-webkit-details-marker]:hidden">
            <span
              className="material-symbols-outlined text-[18px] text-on-surface-variant transition group-open:rotate-90"
              aria-hidden
            >
              chevron_right
            </span>
            Integrations
          </summary>
          <ul className="mt-1 space-y-0.5 pb-1 pl-1">
            {items.map((item) => {
              const isActive = active === item.id;
              return (
                <li key={item.id}>
                  <Link
                    href={hrefFor(workspaceQuery, item.id)}
                    className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                      isActive
                        ? 'bg-surface-container-high text-on-background shadow-sm'
                        : 'text-on-surface-variant hover:bg-surface-container-high/60 hover:text-on-background'
                    } ${!item.enabled ? 'opacity-70' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                  >
                    <span
                      className={`material-symbols-outlined text-[22px] ${isActive ? 'text-primary' : 'text-on-surface-variant'}`}
                      aria-hidden
                    >
                      {item.icon}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </details>

        <details className="group rounded-xl">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-lg px-2 py-2 text-xs font-semibold uppercase tracking-wider text-on-surface-variant marker:hidden [&::-webkit-details-marker]:hidden">
            <span
              className="material-symbols-outlined text-[18px] text-on-surface-variant transition group-open:rotate-90"
              aria-hidden
            >
              chevron_right
            </span>
            Coming soon
          </summary>
          <ul className="mt-1 space-y-0.5 pb-1 pl-1">
            {(['LinkedIn', 'X (Twitter)'] as const).map((name) => (
              <li
                key={name}
                className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-on-surface-variant/70"
              >
                <span className="material-symbols-outlined text-[22px] opacity-50" aria-hidden>
                  public
                </span>
                <span className="truncate">{name}</span>
              </li>
            ))}
          </ul>
        </details>
      </nav>
    </aside>
  );
}
