import Link from 'next/link';

type BlogPaginationProps = {
  readonly currentPage: number;
  readonly totalPages: number;
  readonly basePath: string;
};

function buildHref(basePath: string, page: number): string {
  if (page <= 1) return basePath;
  const sep = basePath.includes('?') ? '&' : '?';
  return `${basePath}${sep}page=${page}`;
}

export function BlogPagination({ currentPage, totalPages, basePath }: BlogPaginationProps) {
  if (totalPages <= 1) return null;

  const windowSize = 5;
  let start = Math.max(1, currentPage - Math.floor(windowSize / 2));
  let end = Math.min(totalPages, start + windowSize - 1);
  if (end - start + 1 < windowSize) {
    start = Math.max(1, end - windowSize + 1);
  }

  const pages: number[] = [];
  for (let p = start; p <= end; p += 1) pages.push(p);

  return (
    <nav aria-label="Blog pagination" className="flex flex-wrap items-center justify-center gap-2">
      {currentPage > 1 ? (
        <Link
          href={buildHref(basePath, currentPage - 1)}
          className="rounded-full px-4 py-2 font-sans text-sm font-medium text-on-background ring-1 ring-outline-variant/40 hover:bg-surface-container-low"
        >
          Previous
        </Link>
      ) : null}
      {start > 1 ? (
        <>
          <PageLink page={1} basePath={basePath} currentPage={currentPage} />
          {start > 2 ? (
            <span className="px-2 text-on-surface-variant" aria-hidden>
              …
            </span>
          ) : null}
        </>
      ) : null}
      {pages.map((p) => (
        <PageLink key={p} page={p} basePath={basePath} currentPage={currentPage} />
      ))}
      {end < totalPages ? (
        <>
          {end < totalPages - 1 ? (
            <span className="px-2 text-on-surface-variant" aria-hidden>
              …
            </span>
          ) : null}
          <PageLink page={totalPages} basePath={basePath} currentPage={currentPage} />
        </>
      ) : null}
      {currentPage < totalPages ? (
        <Link
          href={buildHref(basePath, currentPage + 1)}
          className="rounded-full px-4 py-2 font-sans text-sm font-medium text-on-background ring-1 ring-outline-variant/40 hover:bg-surface-container-low"
        >
          Next
        </Link>
      ) : null}
    </nav>
  );
}

function PageLink({
  page,
  basePath,
  currentPage,
}: {
  readonly page: number;
  readonly basePath: string;
  readonly currentPage: number;
}) {
  const isCurrent = page === currentPage;
  const href = buildHref(basePath, page);
  if (isCurrent) {
    return (
      <span
        className="min-w-[2.5rem] rounded-full bg-primary px-3 py-2 text-center font-sans text-sm font-semibold text-on-primary"
        aria-current="page"
      >
        {page}
      </span>
    );
  }
  return (
    <Link
      href={href}
      className="min-w-[2.5rem] rounded-full px-3 py-2 text-center font-sans text-sm font-medium text-on-background ring-1 ring-outline-variant/30 hover:bg-surface-container-low"
    >
      {page}
    </Link>
  );
}
