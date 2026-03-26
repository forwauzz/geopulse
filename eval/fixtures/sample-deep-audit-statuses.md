# GEO-Pulse — AI Search Readiness Report

- **Domain:** blocked.example
- **URL:** https://blocked.example/
- **Score:** 54/100 (D)
- **Generated:** 2026-03-26T12:05:00.000Z
- **Scan ID:** 11111111-1111-1111-1111-111111111111

## Executive Summary

Your site scored 54/100 (D). 6 of 11 checks passed. The most critical gap is: AI crawler access.

## Coverage Summary

- **Seed URL:** https://blocked.example/
- **URLs planned:** 4
- **Pages fetched:** 2
- **Pages errored:** 0
- **robots.txt status:** 200
- **Crawl delay applied:** 1000ms

## Priority Action Plan

1. **AI crawler access** [High]
   - robots.txt blocks GPTBot and ClaudeBot.
   - **Fix:** Update robots.txt to allow the AI crawlers you intend to permit.

## Score Breakdown — All Checks

| Check | Status | Weight | Finding |
|-------|--------|--------|---------|
| AI crawler access | FAIL | 10 | robots.txt blocks GPTBot and ClaudeBot |
| Rendered content | BLOCKED | 8 | 403 returned to crawler |
| Q&A structure | LOW_CONFIDENCE | 7 | Limited extractable blocks found |
| Product schema | NOT_EVALUATED | 5 | No product pages in sample |
| Alt text | WARNING | 3 | Partial image coverage |
| llms.txt | PASS | 4 | Present |

## Pages Scanned

- **https://blocked.example/** — 54/100 (D) — _section root_
- **https://blocked.example/help** — 61/100 (D) — _section help_

## Technical Appendix

- **Coverage payload:**

```json
{
  "seed_url": "https://blocked.example/",
  "urls_planned": 4,
  "pages_fetched": 2,
  "pages_errored": 0,
  "robots_status": 200,
  "crawl_delay_ms": 1000
}
```

---

_This score reflects technical signals relevant to AI search readiness — not a prediction of rankings or citations._
