# GEO-Pulse Benchmark Seed — Summary

**File:** `benchmark_seed.csv`
**Generated:** 2026-03-29
**Total rows:** 445
**Schema:** `url, domain, industry, status, priority`

---

## Industry Coverage

| Industry | Target | Actual | Status | Notes |
|---|---|---|---|---|
| dental | 150 | 148 | ✅ Ready | 2 under target — quality cutoff applied. Mix of DSOs, cosmetic, ortho, pediatric, implant practices across 20+ cities. |
| law_firms | 150 | 147 | ✅ Ready | 3 under target. Spans PI, family, criminal, immigration, IP, corporate, workers' comp, bankruptcy. National and regional firms. |
| real_estate | 150 | 150 | ✅ Ready | Full 150. Mix of global brands (CBRE, JLL), national chains (Coldwell Banker, RE/MAX), boutique brokerages, and solo agent sites. |
| home_services | 150 | 0 | ⏳ Pending | Web search quota exhausted before this industry was reached. |
| accounting_cpa | 150 | 0 | ⏳ Pending | Web search quota exhausted before this industry was reached. |
| ecommerce_dtc | 150 | 0 | ⏳ Pending | Web search quota exhausted before this industry was reached. |
| saas_software | 150 | 0 | ⏳ Pending | Web search quota exhausted before this industry was reached. |
| fitness_wellness | 150 | 0 | ⏳ Pending | Web search quota exhausted before this industry was reached. |
| financial_advisors | 150 | 0 | ⏳ Pending | Web search quota exhausted before this industry was reached. |
| hospitality_hotels | 150 | 0 | ⏳ Pending | Web search quota exhausted before this industry was reached. |
| private_clinics | 150 | 0 | ⏳ Pending | Web search quota exhausted before this industry was reached. |
| consulting | 150 | 0 | ⏳ Pending | Web search quota exhausted before this industry was reached. |

**Completed:** 3 / 12 industries
**Total target:** 1,800 rows
**Current total:** 445 rows (24.7% of target)

---

## Priority Distribution (completed industries)

| Priority | Label | Count |
|---|---|---|
| 1 | Well-known brand | 62 |
| 2 | Mid-size business | 148 |
| 3 | Small / niche | 235 |

---

## Next Steps

The remaining 9 industries are ready to research — they just need web search quota available. Recommended approach:

1. Run research in **batches of 2–3 industries** per session to stay within search quota limits.
2. Append results to `benchmark_seed.csv` using `INSERT` or `COPY` — headers already set.
3. De-duplicate on `domain` before each load to prevent conflicts.

### Suggested Supabase import command
```sql
COPY benchmark_work_queue(url, domain, industry, status, priority)
FROM '/path/to/benchmark_seed.csv'
DELIMITER ','
CSV HEADER;
```

Or via the Supabase dashboard: Table Editor → Import CSV → select `benchmark_seed.csv`.
