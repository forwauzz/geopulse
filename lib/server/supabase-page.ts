/**
 * Paginated reads for evidence queries.
 *
 * PostgREST caps every response at the server's `max-rows` setting (1000 on this project),
 * REGARDLESS of the `.limit()` a caller asks for. A `.limit(5000)` against a 1111-row table
 * returns 1000 rows and no error — the query looks like it succeeded and the caller quietly
 * reasons about a truncated world.
 *
 * That is fine for a display list and dangerous for a suppression check: "this address is not in
 * the unsubscribed set" and "this address is not in the first 1000 unsubscribed rows" are very
 * different statements, and only one of them is safe to send mail on. Anything a fail-closed gate
 * depends on must read every row.
 */

const PAGE_SIZE = 1000;
/** Backstop against an unbounded scan if a table grows unexpectedly. Exceeding it throws. */
const MAX_PAGES = 100;

type PageQuery = {
  range(from: number, to: number): PromiseLike<{ data?: unknown; error?: unknown }>;
};

/**
 * Read every row a query matches, one page at a time.
 *
 * Throws rather than returning partial data: a caller that silently accepted a short read would
 * reintroduce the exact bug this exists to prevent.
 */
export async function fetchAllRows<T = Record<string, unknown>>(
  build: () => PageQuery,
  label = 'query',
): Promise<T[]> {
  const rows: T[] = [];

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const result = await build().range(from, from + PAGE_SIZE - 1);
    if (result.error) {
      const message = typeof result.error === 'object' && result.error && 'message' in result.error
        ? String((result.error as { message: unknown }).message)
        : String(result.error);
      throw new Error(`${label} failed at row ${String(from)}: ${message}`);
    }

    const batch = Array.isArray(result.data) ? (result.data as T[]) : [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }

  throw new Error(`${label} exceeded ${String(MAX_PAGES * PAGE_SIZE)} rows; refusing to reason about a truncated result`);
}
