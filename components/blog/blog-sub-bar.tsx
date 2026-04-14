import Link from 'next/link';

type TopicLink = {
  readonly href: string;
  readonly label: string;
};

type BlogSubBarProps = {
  readonly topicLinks: readonly TopicLink[];
};

export function BlogSubBar({ topicLinks }: BlogSubBarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-outline-variant/25 pb-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-sans text-lg font-semibold text-gold">Blog</span>
        <span className="hidden text-on-surface-variant sm:inline" aria-hidden>
          |
        </span>
        <Link
          href="#browse-topics"
          className="font-sans text-sm font-medium text-on-background underline decoration-gold/50 underline-offset-4 hover:text-primary"
        >
          Browse topics
        </Link>
      </div>
      {topicLinks.length > 0 ? (
        <details className="relative">
          <summary className="cursor-pointer list-none font-sans text-sm font-medium text-on-background hover:text-primary [&::-webkit-details-marker]:hidden">
            <span className="inline-flex items-center gap-1">
              Categories
              <span className="text-xs" aria-hidden>
                ▾
              </span>
            </span>
          </summary>
          <ul className="absolute right-0 z-10 mt-2 min-w-[12rem] rounded-xl border border-outline-variant/40 bg-surface-container-lowest py-2 shadow-float">
            {topicLinks.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="block px-4 py-2 text-sm text-on-background hover:bg-surface-container-low"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
