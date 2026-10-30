# Teché SEO Operator (private local)

Six stdio MCP tools produce private evidence for `techehealthservices.com`. No Next app, database, billing, queue, hosting service or production environment is required. Node 22 or newer is required. This package is an adapter over GEO-Pulse's existing scan, report, search-provider and benchmark engines. Build it inside the repository; the resulting bundled runtime is portable and has no runtime npm dependency directory.

## Build and verify

From this directory run `npm ci --ignore-scripts`, `npm run build`, `npm test`, `npm run validate`, `npm run smoke`. `npm run smoke -- --live` performs a three-page public crawl and saves new PDF, Markdown and JSON evidence. The smoke child intentionally receives no provider credentials. `server/dist/engine-inputs.json` records the dependency boundary. The root package's duplicate engines key is an existing warning, unrelated to this package.

Run `npm run package` to create the private local marketplace in `test-output/local-marketplace`. This copies only built runtime, manifests, instructions and documentation; no source dependency directories, secrets or local evidence. Register that path with `codex plugin marketplace add <absolute-path> --json`, then `codex plugin add teche-seo-operator@teche-local --json`. Reload the host and check that it discovers exactly six tools; call `teche_get_status`. CLI installation and standalone tools/list are not proof of discovery by an already running chat. Codex owns final host validation. Do not publish/upload this private package.

## Evidence and safety

State lives at `%LOCALAPPDATA%/teche-seo-operator/`. Each run appends distinct events and artifact files. A single writer lock protects the store across processes; one server queues concurrent calls. Writes use exclusive temporary files, fsync and rename. Previous findings are never overwritten. Record filenames establish order even for same-millisecond writes. State must remain in a private, local, non-symlink directory owned by the user.

Site calls permit HTTPS GET to the exact apex hostname only, public DNS addresses pinned to the TLS connection, at most five pages and 24 requests per call, 1.5MB per response and 15 seconds per socket. Credentials, query strings, fragments, admin/API/login paths, other domains and off-host redirects are rejected. Crawl selection skips category, tag, author and feed archives. No arbitrary shell, path, SQL or URL execution is exposed. Site/provider text cannot override policy.

The scan is a bounded HTML sample. Search Console, AI visibility, browser rendering, actual indexation and paid ranking are separate or unavailable evidence. Missing side resources are not evaluated. The private presentation adapter reuses the shared payload, PDF cover and Markdown check-reference renderer. It presents confirmed findings, warnings and unknown observations separately, with original findings and affected URLs. Dynamically measured cards paginate without overlapping. It never infers an access failure from a warning or an optional untested check. Full counts and original scoring inputs remain in JSON; all observations remain in Markdown. Existing GEO-Pulse report modules and default behavior are unchanged. Inspect exact affected page URLs before recommending changes. PDF/Markdown are generated only after the existing report QA gate passes; human content/layout review is still required. Append-only review-hold events exclude rejected audits from action plans without changing their artifacts.

## Credentials and cost caps

Only use credentials already authorized and provided through the host environment/secret mechanism. Do not put them in manifests, config, state, command arguments, screenshots or source control. The server never loads project `.env` files. `GOOGLE_SEARCH_CONSOLE_ACCESS_TOKEN` reads only `sc-domain:techehealthservices.com` (at most 500 final query/page rows, 31 days per call). Expired access is a failed operation; no token acquisition or refresh is automated.

Perplexity uses existing `PERPLEXITY_API_KEY` with fixed Sonar discovery prompts. It stays skipped unless all of `TECHE_PERPLEXITY_RUN_REQUEST_CAP`, `TECHE_PERPLEXITY_MONTH_REQUEST_CAP`, `TECHE_PERPLEXITY_RESERVED_USD_PER_REQUEST`, and `TECHE_PERPLEXITY_MONTH_USD_CAP` are already set. Hard ceilings are 3 requests/run, 30 requests/UTC month and $5 reserved/month. Each network attempt reserves budget before transmission; failures do not refund it. The per-request reservation must cover the provider's authorized maximum request cost; this ledger is a reservation, not a billing invoice. No live paid call is part of setup verification. A missing/zero cap disables execution. DataForSEO has hard zero per-run/monthly request and spend caps in v1, regardless of credentials: no rank requests are sent. Missing data is null/unavailable, not zero performance.

## Scheduling and coordination

No schedule is installed automatically. An existing authorized host scheduler may invoke these tools; start with status, avoid overlapping writers and keep the same caps. A run must retain its coverage and unavailable providers in any combined digest through Andere. Scheduling does not authorize publication or increased spending. Three failed/unavailable attempts per unchanged tool/arguments lineage halt. Fix the cause and obtain review before recovery; never erase failure history to force retries.

## Backup, recovery and uninstall

Stop the local MCP process before backing up the entire state directory. Copy events and artifacts together to a private backup; verify hashes recorded in result events. Backups can contain public-page findings and search queries, so protect them as private business evidence. Restore into an empty private directory only after preserving the current state; never merge or silently replace evidence.

After a crash, inspect `writer.lock` and confirm its recorded process is no longer running before removing that lock. Preserve `.tmp` files for inspection; they are incomplete and not loaded as events. Do not edit complete event JSON. If events are corrupt, stop, preserve a backup and restore a verified whole-store backup; do not fabricate successful results. A stale lock intentionally blocks writes.

Use `codex plugin remove teche-seo-operator@teche-local` (check the installed CLI help) to uninstall; remove the private marketplace registration if unused. Uninstall does not delete `%LOCALAPPDATA%/teche-seo-operator/`. Keep evidence until the owner explicitly authorizes deletion. No website or production rollback is needed because this plugin does not mutate either.
