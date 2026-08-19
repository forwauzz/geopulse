# GEO-Pulse Repair Agent

This dedicated Cloudflare Worker is the bounded proof for issue #515. It accepts one executable
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
jobs with `Authorization: Bearer <token>` to `POST /v1/repairs`; inspect durable state through
`GET /v1/status`. The public `GET /health` response exposes only mode, kill-switch state, and the
hard-coded fact that production mutation is disabled.
