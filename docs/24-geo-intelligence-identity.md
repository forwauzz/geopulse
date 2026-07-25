# GEO Intelligence Canonical Identity

Status: implementation contract for `INT-002` / GitHub issue `#213`.

## Boundary

The identity layer is an additive index over operational data. It does not
replace `scans`, `benchmark_domains`, their foreign keys, or any customer-facing
record. Every source resolves through `(source_kind, source_id)` to a canonical
domain/page or an explicit unmapped reason.

The first normalization protocol is `domain-page-v1`:

- accepts a host or HTTP(S) URL;
- lowercases the host and removes a terminal dot;
- treats leading `www.` as an observed alias of the normalized host;
- preserves other subdomains as distinct properties;
- rejects localhost, IP addresses, empty identities, invalid URLs, and
  non-HTTP protocols with explicit reason codes;
- normalizes pages to HTTPS, removes fragments/default ports/trailing slashes,
  collapses duplicate path separators, and sorts query parameters;
- retains the original observed URL.

This protocol deliberately does not infer registrable domains, corporate
ownership, redirects, or rebrands from string similarity.

## Tables

- `intelligence_domains`: one normalized host plus vertical, subvertical, and
  geography fields.
- `intelligence_domain_aliases`: canonical/observed aliases and review-gated
  redirects or rebrands.
- `intelligence_domain_owners`: explicit tenant, shared, or internal ownership.
- `intelligence_pages`: normalized and original page URLs.
- `intelligence_source_identity_maps`: source pointers, mapping status, version,
  and unmapped reason.

The tables are service-role only. RLS is enabled without anon/authenticated
policies. Later customer APIs must project data through ownership links rather
than exposing the canonical store.

## Backfill

Preview is the default and performs no writes:

```bash
npm run intelligence:identity:backfill
```

Apply requires both flags:

```bash
npm run intelligence:identity:backfill -- --apply --confirm=INT-002
```

The apply path upserts canonical domains, aliases, pages, owners, and source
mappings. It is restartable and does not mutate source rows. It currently maps:

- scans and scan pages;
- benchmark domains and query runs;
- reports and startup recommendations through their source lineage;
- report/retrieval eval runs;
- recurring schedules and monitoring subscriptions.

The report includes counts by source, explicit unmapped reasons, and distinct
raw-host forms that normalize to the same host. Redirect/rebrand observations
are inserted as `needs_review`; they do not silently merge businesses.

## Production preview

The 2026-07-25 read-only preview evaluated 13,194 source records: 13,189 mapped
to 266 domain identities, five old report evals were explicitly unmapped for
missing identity, and 636 unique page URLs were identified. These are a dated
observation; rerun preview for current coverage before any apply.
