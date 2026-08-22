# GEO-Pulse Repair Agent

This dedicated Cloudflare Worker and GitHub control-plane workflow are the bounded repair loop for
issues #515, #520, #523, and #527. The Worker accepts one executable
audit finding at a time, admits only allowlisted low-risk repair skills, executes fixture repairs
inside Cloudflare Sandbox, and independently evaluates the result.

The deployed configuration is intentionally `shadow` mode. `REPAIR_PRODUCTION_MUTATIONS_ENABLED`
is hard-coded to `false`, the container receives no production credentials, and skills operate only
on a supplied fixture. A successful shadow job is evidence that the artifact is eligible; repository,
review, merge, deployment, and rollback authority stays in separately authenticated GitHub jobs.

## Safety contract

- one active job per site agent;
- maximum three evidence-backed attempts;
- repository and origin allowlists;
- exact skill/check compatibility;
- path traversal and secret-file rejection;
- per-skill file and changed-line budgets;
- independent postcondition and regression evaluation;
- fail-closed bearer authentication for mutating API calls;
- no network, Git, deployment, billing, authentication, privacy, legal, or production tools in the
  Sandbox image;
- production mutation remains disabled even if a caller asks for it.

## Audit-to-production loop

The production Cloudflare Worker remains the single recurring GEO-Pulse self-audit scheduler. A
successful committed audit is delivered over a same-account service binding to `POST /v1/audits`.
Before that call, the main Worker persists the envelope in the existing `SCAN_CACHE` KV namespace.
Hourly cron ticks retry the same audit ID after 5 and 30 minutes, delete the outbox record only after
the coordinator accepts it, and retain an owned `exhausted` record after the third failed attempt.
The retry scanner paginates past exhausted and future-due records with a bounded scan ceiling so an
old first page cannot starve later due deliveries.
The repair coordinator records every run, deduplicates its audit ID, and queues at most one finding
only when an installed repository profile, exact check-to-skill mapping, high confidence, low risk,
path allowlist, and skill budget all agree. The current production audit adapter deliberately marks
findings without exact repository evidence as unsupported; it never guesses a file or replacement.
Profile selection now goes through a strict runtime registry keyed by profile ID, producer authority,
repository, and audit origin. The coordinator computes a canonical SHA-256 digest of the installed
profile and binds it into the scope; callers cannot choose profile contents by sending an ID alone.

The manual `repair-loop-canary` workflow remains a non-merging fixture proof. It also issues
distinct, non-gating exact-SHA canary checks from the Reviewer, QA, and Merge App installations;
the Merge canary proves the activation variable is still false and has no merge step. The production
`repair-loop` workflow is separately opt-in through `REPAIR_LOOP_ENABLED`, runs every 15 minutes,
and implements the staged lifecycle:

1. run each role's tests separately;
2. submit a controlled audit and lease its exact scope;
3. execute the bounded repair in Cloudflare Sandbox;
4. retrieve a verified artifact whose returned bytes are bound to recomputed SHA-256 evidence;
5. create or reuse one bounded issue, branch, and one-file PR;
6. review and QA the immutable base/head diff in read-only jobs;
7. emit SHA/patch/attempt/profile-digest-bound engineer, review, and QA artifacts;
8. refetch the exact live checks and PR, recheck the operator switch and Worker kill switch, then
   merge the exact SHA;
9. return a failed reviewer/QA verdict to that same scope, incrementing its bounded attempt or
   recording exhaustion after attempt three; and
10. wait for the exact Cloudflare deployment, verify the live finding postcondition and bounded
    production probes, then acknowledge the scope and close its issue; or
11. create a deterministic revert, require CI and its exact Cloudflare deployment, verify bounded
    rollback probes, and return structured failure to the same repair lineage.

Scope acknowledgement and feedback commits are idempotent across a lost HTTP response. The
coordinator records the exact attempt, lease, and evidence digest before removing or requeuing the
scope; an exact replay returns the committed result, while changed evidence is rejected. Secret-
bearing feedback and gate scripts always execute from the trusted default-branch SHA, never from
the engineer branch. The gate also refetches the open PR and verifies its exact base and head SHAs
before merging. The scope transitions to `awaiting_qa` after merge and cannot be acknowledged until
deployment QA passes; the finalizer reconciles a lost post-merge response before acknowledging it.
Retry feedback is part of the parsed repair request, Sandbox job,
evaluation digest, and verified artifact; it is not merely coordination metadata. One Sandbox
execution is allowed per scope attempt, keeping the end-to-end ceiling at three.

On startup, persisted state is normalized before RPC handling. Provenance-complete scopes remain
queued; older incomplete scopes are removed from execution and recorded as quarantined audit
history requiring a fresh audit. Historical evidence is preserved rather than rewritten.

The PR-only fixture canary completed through independent review and QA in #526 without merging it.
GEO-Pulse now has separately installed reviewer, QA, and merge-controller GitHub Apps, while the
engineer remains unable to issue any role verdict. The production schedule stays fail-closed while
`REPAIR_LOOP_ENABLED=false`. Activation additionally requires a default-branch ruleset and Checks
write permission on the merge-controller App; neither condition is inferred from repository code.

The deterministic future merge contract is nonetheless executable and fail-closed. It recomputes
the complete installed profile digest at every artifact, verdict, merge, and deployment boundary and validates the
current open PR's exact repository, base branch, base/head SHAs, mergeability, linked bounded issue,
fresh observation time, change budgets, profile digest, engineer evidence, authorized GitHub App IDs,
pairwise-distinct engineer/reviewer/QA/merge-controller App authorities, exact required-check
observations bound to check-run ID/current SHA/fresh fetch, opt-in, and kill switch. Every
role verdict is content-digested and bound to the authenticated GitHub observation that issued it.
The GEO-Pulse profile records the installed reviewer, QA, and controller App IDs and requires them to
be pairwise distinct. The runtime still refuses a positive decision unless the exact observed Apps,
checks, current SHA, operator switch, and kill-switch state all match.

## Portable repository contract

The current runtime installs GEO-Pulse and its controlled canary profiles only; cross-repository
writes remain disabled. A second repository must provide a versioned profile declaring its exact
repository/default branch, HTTPS origin, allowed path prefixes, repair skill allowlist, file/line
budgets, a trusted orchestrator-owned QA command preset ID, exact check/app IDs, role issuer policies,
GitHub App adapter mode, preview URL
template, and production smoke URLs. The checked-in
`test/portable-repo/.repair-agent/repository-profile.v1.json` file is the portable onboarding
artifact and is compared byte-for-value with the `portable-fixture-v1` contract in tests. Repository
profiles never carry executable command text. Preset IDs resolve to immutable argument arrays owned
by the coordinator, preventing a repository profile from injecting a deploy, secret, or shell command.
QA must return every command in the selected preset exactly once; a successful subset or duplicated
command is not accepted as complete evidence.

`test/portable-loop.test.ts` is an executable second-repository proof. It creates a disposable Git
repository, produces an audit and deterministic scope, runs the bounded repair runner, commits the
one-file patch, derives exact base/head/patch evidence, executes the trusted QA preset, emits distinct
reviewer and QA observations, obtains a positive dry-run merge decision, and verifies deployment
identity, version, source SHA, URL inventory, response status, redirect origin, and body digests. It
never creates or writes a real external repository.

The GitHub observation adapter is the credential-owning boundary: it fetches
check runs, PR state, and linked-issue evidence for its fixed repository and stamps observation time
from its own clock. Role callers do not supply repository or timestamps. Unit fixtures implement that
reader interface, and the production merge CLI supplies the authenticated GitHub App reader.

Deployment QA never has deploy or merge authority. It recomputes the
profile digest and validates the profile-bound provider, deployment ID, version, source SHA, fresh timestamp,
complete preview/production URL inventory, exact redirect behavior, response status, and probe-content
digest. `DeploymentEvidenceAdapter` fixes the repository/provider/URL inventory and clock at the
credential-owning boundary; the disposable proof supplies only a fixture reader. The production CLI
uses authenticated GitHub check-run evidence for the exact Cloudflare build and directly probes every
GEO-Pulse production URL plus the repaired robots postcondition. Fixture observations are never
accepted by the GEO-Pulse production profile.

Moving from the fixture to another real repository additionally requires a separately authorized
GitHub App installation with least-privilege repository access and its own branch rules. GitHub
credentials never enter Cloudflare Sandbox; the repository adapter uses short-lived installation
tokens in the GitHub control plane.

The live PR-only canary uses an explicit `logical-shadow-v1` artifact discriminator. The future
authenticated gate accepts only `authenticated-github-v1`, preventing logical jobs under the shared
GitHub Actions principal from being mistaken for independent App verdicts.

The exact remaining GEO-Pulse activation boundary is: merge and deploy #527, grant the existing merge-
controller App Checks read/write permission, install a default-branch ruleset requiring pull requests,
strict up-to-date Actions-issued `verify`, and no force-push/delete/bypass, prove all three App-issued checks in a controlled run,
then set `REPAIR_LOOP_ENABLED=true`. Role verdicts are also required by the deterministic controller,
so an unreviewed repair cannot merge even though those repair-only checks are not imposed on unrelated
repository PRs. The dedicated Worker check is named `repair-agent-verify`, leaving the root CI aggregate
`verify` as the single server-ruleset context. None of these external permissions is inferred or enabled by the code.

## Local verification

```sh
npm ci
npm run cf-typegen
npm test
npm run type-check
```

Docker is required only for the container build and smoke. GitHub Actions owns those steps so the
founder workstation is not an operational dependency.

The shadow API is fail-closed until `REPAIR_AGENT_API_TOKEN` is stored as a Worker secret. Submit
shadow audits with the same header to `POST /v1/audits`, lease them through
`POST /v1/scopes/claim`, submit fixtures to `POST /v1/repairs`, and retrieve a successful artifact
from `GET /v1/artifacts/:jobId`. `GET /v1/status` returns summaries without artifact file bytes. The
controller records a successful merge through `POST /v1/scopes/merged`; the production finalizer
closes a deployment-verified lease through `POST /v1/scopes/ack`; a failed role posts
bounded reasons to `POST /v1/scopes/feedback`, which requeues the same repair identity with the next
attempt or records exhaustion at attempt three. The
public `GET /health` response exposes only mode, kill-switch state, and the hard-coded fact that
production mutation is disabled.
