# GEO-Pulse Repair Agent

This dedicated Cloudflare Worker is the bounded proof for issues #515, #520, and #523. It accepts one executable
audit finding at a time, admits only allowlisted low-risk repair skills, executes fixture repairs
inside Cloudflare Sandbox, and independently evaluates the result.

The deployed configuration is intentionally `shadow` mode. `REPAIR_PRODUCTION_MUTATIONS_ENABLED`
is hard-coded to `false`, the container receives no production credentials, and the first three
skills operate only on a supplied fixture. A successful shadow job is evidence that the repair is
eligible; it is not authority to change the live website.

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

## Audit-to-PR canary

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

The manual `repair-loop-canary` GitHub workflow proves the staged lifecycle:

1. run each role's tests separately;
2. submit a controlled audit and lease its exact scope;
3. execute the bounded repair in Cloudflare Sandbox;
4. retrieve a verified artifact whose returned bytes are bound to recomputed SHA-256 evidence;
5. open a one-file fixture PR;
6. review and QA the immutable base/head diff in read-only jobs;
7. emit SHA/patch/attempt/profile-digest-bound engineer, review, and QA artifacts;
8. validate all three artifacts in the merge controller before acknowledging the leased scope;
9. return a failed reviewer/QA verdict to that same scope, incrementing its bounded attempt or
   recording exhaustion after attempt three; and
10. dispatch the same repair lineage back to the engineer, carrying the bounded feedback and
    updating the same agent-owned PR branch with a new SHA.

Scope acknowledgement and feedback commits are idempotent across a lost HTTP response. The
coordinator records the exact attempt, lease, and evidence digest before removing or requeuing the
scope; an exact replay returns the committed result, while changed evidence is rejected. Secret-
bearing feedback and gate scripts always execute from the trusted default-branch SHA, never from
the engineer branch. The gate also refetches the open PR and verifies its exact base and head SHAs
before acknowledging the scope. Retry feedback is part of the parsed repair request, Sandbox job,
evaluation digest, and verified artifact; it is not merely coordination metadata. One Sandbox
execution is allowed per scope attempt, keeping the end-to-end ceiling at three.

On startup, persisted state is normalized before RPC handling. Provenance-complete scopes remain
queued; older incomplete scopes are removed from execution and recorded as quarantined audit
history requiring a fresh audit. Historical evidence is preserved rather than rewritten.

The first production canary proved steps 1–4 and pushed its bounded branch. GitHub then failed
closed because the repository setting currently forbids Actions from creating pull requests. That
setting remains a founder-controlled permission; the canary does not work around it or claim that a
PR/review occurred.

The merge controller remains shadow-only. GEO-Pulse currently has one GitHub Actions identity and
no protected required-check rules, so an Actions job cannot be a genuinely independent approver.
Autonomous merge must remain disabled until a separate least-privilege reviewer identity and branch
rules require exact CI, repair-review, and repair-QA checks and dismiss stale verdicts.

The deterministic future merge contract is nonetheless executable and fail-closed. It recomputes
the complete installed profile digest at every artifact, verdict, merge, and deployment boundary and validates the
current open PR's exact repository, base branch, base/head SHAs, mergeability, linked bounded issue,
fresh observation time, change budgets, profile digest, engineer evidence, authorized GitHub App IDs,
pairwise-distinct engineer/reviewer/QA/merge-controller App authorities, exact required-check
observations bound to check-run ID/current SHA/fresh fetch, opt-in, and kill switch. Every
role verdict is content-digested and bound to the authenticated GitHub observation that issued it.
The GEO-Pulse profile intentionally records the not-yet-provisioned reviewer, QA, and controller App
IDs as `null`, which makes a positive production merge decision impossible.

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

The GitHub observation adapter is the credential-owning boundary for future activation: it fetches
check runs, PR state, and linked-issue evidence for its fixed repository and stamps observation time
from its own clock. Role callers do not supply repository or timestamps. Unit fixtures implement that
reader interface; a real GitHub App reader remains required before autonomous merge is enabled.

Deployment QA is currently a dry-run contract, not an autonomous deploy authority. It recomputes the
profile digest and validates the profile-bound provider, deployment ID, version, source SHA, fresh timestamp,
complete preview/production URL inventory, exact redirect behavior, response status, and probe-content
digest. `DeploymentEvidenceAdapter` fixes the repository/provider/URL inventory and clock at the
credential-owning boundary; the disposable proof supplies only a fixture reader. A real Cloudflare
reader must acquire those facts before activation, and a fixture observation is never accepted by the
GEO-Pulse production profile.

Moving from the fixture to another real repository additionally requires a separately authorized
GitHub App installation with least-privilege repository access and its own branch rules. GitHub
credentials never enter Cloudflare Sandbox; the repository adapter uses short-lived installation
tokens in the GitHub control plane.

The live PR-only canary uses an explicit `logical-shadow-v1` artifact discriminator. The future
authenticated gate accepts only `authenticated-github-v1`, preventing logical jobs under the shared
GitHub Actions principal from being mistaken for independent App verdicts.

The exact remaining GEO-Pulse activation boundary is: allow the current PR-only canary to create a
pull request, provision distinct reviewer/QA/merge-controller GitHub Apps, record their numeric App
IDs in the profile, and install a default-branch ruleset requiring the exact CI/reviewer/QA checks
with stale verdict dismissal and no agent bypass. None of those external permissions is inferred or
enabled by this code.

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
review/QA controller closes a successful lease through `POST /v1/scopes/ack`; a failed role posts
bounded reasons to `POST /v1/scopes/feedback`, which requeues the same repair identity with the next
attempt or records exhaustion at attempt three. The
public `GET /health` response exposes only mode, kill-switch state, and the hard-coded fact that
production mutation is disabled.
