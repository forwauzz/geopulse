import { describe, expect, it } from 'vitest';
import { fetchAllRows } from './supabase-page';

/**
 * Models the behaviour that caused the bug: the server caps every response at `maxRows`
 * regardless of the requested range, and reports no error while doing it.
 */
function pagedTable(totalRows: number, maxRows = 1000) {
  const ranges: Array<[number, number]> = [];
  const build = () => ({
    range(from: number, to: number) {
      ranges.push([from, to]);
      const end = Math.min(to, from + maxRows - 1, totalRows - 1);
      const rows = end < from ? [] : Array.from({ length: end - from + 1 }, (_, index) => ({ id: from + index }));
      return Promise.resolve({ data: rows, error: null });
    },
  });
  return { build, ranges };
}

describe('paginated evidence reads', () => {
  it('reads a table larger than one page in full', async () => {
    const { build, ranges } = pagedTable(1111);
    const rows = await fetchAllRows<{ id: number }>(build, 'contacts');
    expect(rows).toHaveLength(1111);
    expect(rows.at(-1)?.id).toBe(1110);
    expect(ranges).toEqual([[0, 999], [1000, 1999]]);
  });

  it('stops after one page when the table is smaller than a page', async () => {
    const { build, ranges } = pagedTable(282);
    expect(await fetchAllRows(build, 'prospects')).toHaveLength(282);
    expect(ranges).toHaveLength(1);
  });

  it('handles an exact page-boundary table without dropping or duplicating rows', async () => {
    const { build } = pagedTable(2000);
    const rows = await fetchAllRows<{ id: number }>(build, 'contacts');
    expect(rows).toHaveLength(2000);
    expect(new Set(rows.map((row) => row.id)).size).toBe(2000);
  });

  it('returns nothing for an empty table', async () => {
    const { build } = pagedTable(0);
    expect(await fetchAllRows(build, 'contacts')).toEqual([]);
  });

  it('throws instead of returning a partial read', async () => {
    let call = 0;
    const build = () => ({
      range: (from: number) => {
        call += 1;
        return call === 1
          ? Promise.resolve({ data: Array.from({ length: 1000 }, (_, index) => ({ id: from + index })), error: null })
          : Promise.resolve({ data: null, error: { message: 'connection reset' } });
      },
    });
    // Silently returning the first 1000 rows is exactly the failure this guards against.
    await expect(fetchAllRows(build, 'contacts')).rejects.toThrow('contacts failed at row 1000: connection reset');
  });

  it('refuses to scan without bound', async () => {
    const { build } = pagedTable(200_000);
    await expect(fetchAllRows(build, 'contacts')).rejects.toThrow('refusing to reason about a truncated result');
  });
});
