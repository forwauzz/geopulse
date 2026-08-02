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

## Organization Context projection

`organization-context-v1` is the portable domain contract layered over this
identity index. It does not add a table or replace operational foreign keys.
The server-only repository first proves an exact `intelligence_domain_owners`
link, then projects the canonical domain, verified aliases, structured market,
and only evidence visible to that exact owner.

Supported owner scopes are:

- `agency_account` for an agency's own business;
- `agency_client` for an agency-managed customer;
- `startup_workspace` for a direct business subscription;
- `user` for legacy user-owned sources; and
- `internal_benchmark`, whose owner ID must remain null.

The same public identity may be reused by several authorized owners. Private
evidence and owner-level settings never cross those ownership links.

Example projection:

```json
{
  "contractVersion": "organization-context-v1",
  "owner": { "type": "agency_client", "id": "<tenant UUID>" },
  "organization": {
    "canonicalDomain": "sanomedsolutions.com",
    "aliases": [{ "host": "sanomed.ca", "relationship": "redirect", "reviewState": "verified" }],
    "category": "private medical clinic",
    "services": ["preventive medicine", "travel medicine"]
  },
  "market": {
    "scope": "local",
    "countryCode": "CA",
    "subdivisionCode": "CA-QC",
    "locality": "Pointe-Claire",
    "serviceAreas": ["Montreal's West Island"],
    "languages": ["en-CA", "fr-CA"],
    "timezone": "America/Toronto"
  },
  "status": "confirmed"
}
```

### Trust and failure behavior

Fact precedence is fixed at tenant confirmation, exact official-site evidence,
structured website evidence, trusted public evidence, grounded suggestions,
then heuristic defaults. Lower-ranked evidence is retained as a proposal but
cannot replace a higher-ranked fact. Material disagreements use stable codes
such as `country_conflict`, `canonical_domain_conflict`,
`market_location_conflict`, and `competitor_market_conflict`, and force the
projection to `conflicted`.

Country, subdivision, language, timezone, and market scope are structured
keys rather than free-text joins. Missing required market keys return a stable
`needs_review` reason instead of inventing a value. Context versions are
deterministic content identities; changing projection time alone does not
create a new version. Material changes produce explicit reason codes for
market, services, buyer, language, aliases, competitors, and conflict state.

The Zod contract and matching portable JSON Schema live in
`lib/intelligence/organization-context.ts`. The tenant-scoped projection lives
in `lib/server/organization-context-repository.ts`.

## Exact-domain resolver

`organization-resolver-v1` is the read-only detection layer in front of
Organization Context. It uses the existing SSRF-gated fetch path, records every
validated redirect hop, and extracts canonical identity, schema.org business
facts, addresses, service areas, services, public contact signals, languages,
and explicit market-scope signals from the exact official site before any
search or model enrichment.

Cross-domain redirects require an already verified alias. Missing structured
location stays `needs_review`; cross-country, canonical-domain, category, and
same-name identity disagreements stay `conflicted`. A confirmed tenant context
is never mutated by the resolver. Search/model adapters receive the exact-site
evidence IDs in their request, and parsed context or competitor suggestions are
accepted only when their evidence is recoverable and their identity and market
remain compatible.

The safe shadow command performs no writes:

```bash
npm run intelligence:organization:resolve -- --url=https://example.com --aliases=example.ca
```
