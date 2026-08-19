# GEO-Pulse Repair Agent

This dedicated Cloudflare Worker is the bounded proof for issues #515 and #520. It accepts one executable
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
The repair coordinator records every run, deduplicates its audit ID, and queues at most one finding
only when an installed repository profile, exact check-to-skill mapping, high confidence, low risk,
path allowlist, and skill budget all agree. The current production audit adapter deliberately marks
findings without exact repository evidence as unsupported; it never guesses a file or replacement.

The manual `repair-loop-canary` GitHub workflow proves the staged lifecycle:

1. run each role's tests separately;
2. submit a controlled audit and lease its exact scope;
3. execute the bounded repair in Cloudflare Sandbox;
4. retrieve a verified artifact whose returned bytes are bound to recomputed SHA-256 evidence;
5. open a one-file fixture PR;
6. review and QA the immutable base/head diff in read-only jobs;
7. emit structured SHA-bound verdict artifacts and feed failures back to the same PR.

The merge controller remains shadow-only. GEO-Pulse currently has one GitHub Actions identity and
no protected required-check rules, so an Actions job cannot be a genuinely independent approver.
Autonomous merge must remain disabled until a separate least-privilege reviewer identity and branch
rules require exact CI, repair-review, and repair-QA checks and dismiss stale verdicts.

## Portable repository contract

`src/loop/repository-profile.ts` contains no GEO-Pulse execution assumptions beyond the installed
`geopulse-v1` profile. A second repository must provide a versioned profile declaring its exact
repository/default branch, HTTPS origin, allowed path prefixes, repair skill allowlist, file/line
budgets, allowlisted QA commands, and required checks. The included `portable-fixture-v1` profile is
the contract test for a non-GEO-Pulse repository.

Moving from the fixture to another real repository additionally requires a separately authorized
GitHub App installation with least-privilege repository access and its own branch rules. GitHub
credentials never enter Cloudflare Sandbox; the repository adapter uses short-lived installation
tokens in the GitHub control plane.

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
public `GET /health` response exposes only mode, kill-switch state, and the hard-coded fact that
production mutation is disabled.
