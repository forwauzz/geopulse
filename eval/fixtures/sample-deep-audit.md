# GEO-Pulse — AI Search Readiness Report

- **Domain:** example.com
- **URL:** https://example.com/
- **Score:** 72/100 (B)
- **Generated:** 2026-03-26T12:00:00.000Z
- **Scan ID:** 00000000-0000-0000-0000-000000000000

## Executive Summary

Your site scored 72/100 (B). 12 of 17 checks passed. The most critical gap is: Meta description.

## Category Breakdown

| Category | Score | Grade | Checks |
|----------|-------|-------|--------|
| AI Readiness | 80 | B | 5 |
| Extractability | 64 | C | 8 |
| Trust | 58 | D | 4 |

## Coverage Summary

- **Seed URL:** https://example.com/
- **URLs planned:** 3
- **Pages fetched:** 2
- **Pages errored:** 1
- **robots.txt status:** 200
- **Crawl delay applied:** 0ms

## Priority Action Plan

1. **Meta description** [Medium]
   - Missing or too short.
   - **Fix:** Add a compelling 150–160 character description.
2. **Security headers** [Low]
   - Some recommended headers are missing.
   - **Fix:** Add HSTS and X-Frame-Options.

## Score Breakdown — All Checks

| Check | Status | Weight | Finding |
|-------|--------|--------|---------|
| Title | PASS | 5 | OK |
| Meta description | FAIL | 6 | Too short |
| Security headers | WARNING | 2 | HSTS missing |
| llms.txt | PASS | 4 | Present |
| Q&A structure | LOW_CONFIDENCE | 7 | Some answer blocks found, but confidence is low |

## Pages Scanned

- **https://example.com/** — 72/100 (B) — _section root_
- **https://example.com/docs** — 65/100 (C) — _section docs_

## Per-Page Checklist

### https://example.com/

- **Title** [PASS]
  - Title length is within range.
- **Meta description** [FAIL]
  - Missing description.
  - Fix: Add a concise description.

### https://example.com/docs

- **Security headers** [WARNING]
  - Missing HSTS.
- **Q&A structure** [LOW_CONFIDENCE]
  - Some answer-like blocks found.

## Technical Appendix

- **Coverage payload:**

```json
{
  "seed_url": "https://example.com/",
  "urls_planned": 3,
  "pages_fetched": 2,
  "pages_errored": 1,
  "robots_status": 200,
  "crawl_delay_ms": 0
}
```

---

_This score reflects technical signals relevant to AI search readiness — not a prediction of rankings or citations._
