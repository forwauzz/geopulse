# Epic 35: Priya Multisource SEO Ideas

## Revenue outcome

Turn live search demand and buyer conversations into source-backed pages and social assets without leaving findings in disconnected research notes.

## Issues

- [x] Normalize Google, Reddit, and X findings into the existing `seo_opportunities` bank.
- [x] Feed Sofia's recurring social research into Priya's closed content loop.
- [x] Keep community engagement transparent and approval-only.
- [x] Give admin a dedicated visual idea board with source, status, and search filters.
- [x] Make idea cards collapsible so evidence and reply drafts do not overload the page.
- [x] Add a simple manual intake that immediately assigns accepted ideas to Priya.
- [x] Preserve source links, evidence, recommended angles, and suggested replies.
- [x] Import the initial GEO versus SEO research set.
- [ ] Verify the production board and content-family creation after deployment.

## Closed-loop contract

1. Google, Reddit, X, or Sofia discovers a supported opportunity.
2. The finding is deduplicated in `seo_opportunities`.
3. Priya's existing loop creates a canonical article and an Instagram derivative.
4. Jordan owns production.
5. The parent opportunity closes only after both assets are published.
6. Community replies are never auto-posted. They require review and retain the Geo-Pulse disclosure.

## Simplicity decisions

- Reuse `seo_opportunities`, `content_items`, and `agent_work_loops`; no new database or migration.
- Keep one admin board instead of separate research products.
- Use the existing daily publishing cap rather than adding another scheduler.
- Research broadly, then distill to high-intent opportunities to control content volume and API cost.
