# Epic: X direct publishing authorization

GitHub tracking: [#289](https://github.com/forwauzz/geopulse/issues/289)

## Revenue outcome

GEO-Pulse can turn an approved, evidence-backed social asset into a measured post on
the company-branded `@get_geopulse` account without browser automation, while preserving
editorial approval, attribution, spend caps, retries, and publication proof.

## Guardrails

- Use the official X API and OAuth 2.0 PKCE only.
- Request only `tweet.read`, `tweet.write`, `users.read`, `media.write`, and `offline.access`.
- Never automate replies, direct messages, follows, unfollows, likes, or engagement farming.
- Fail closed when identity, scopes, token encryption, approval, or spend controls are incomplete.
- Never store access tokens, refresh tokens, client secrets, or authorization headers in logs or metadata.
- The first live post is an explicitly approved canary; OAuth consent is not editorial approval.

## Issues

### XDP-1 — Harden OAuth authorization

Add the media scope, signed PKCE state, exact redirect handling, required-scope validation,
and a read-only `/2/users/me` verification.

Acceptance:

- The default request contains exactly the five approved scopes.
- Missing required scopes fail before token persistence.
- The connected account must resolve to `@get_geopulse`.
- State is short-lived, signed, user-bound, provider-bound, and includes the PKCE verifier.

### XDP-2 — Protect provider tokens

Encrypt distribution access and refresh tokens with AES-GCM before database persistence
and decrypt them only at the provider boundary.

Acceptance:

- New OAuth callbacks and manual token saves never persist plaintext.
- OAuth response metadata is allow-listed and excludes token material.
- Refresh rotation persists a newly encrypted envelope.
- Existing legacy plaintext rows remain readable only for bounded migration compatibility.

### XDP-3 — Provide a bounded operator connection

Expose a first-class GEO-Pulse X connection control in the distribution dashboard.

Acceptance:

- The control provisions the stable `x_geopulse` account record.
- The expected username is persisted as `get_geopulse`.
- Connection status and provider-safe OAuth outcomes are visible without exposing secrets.

### XDP-4 — Preserve publishing controls

Keep X publishing behind approved assets, configured spend limits, bounded retries, and
durable publication proof.

Acceptance:

- Text, image, short-video, and long-video paths retain focused automated coverage.
- No live request can be launched without a connected token and approved asset.
- Provider publication ID, public URL, attempt state, and attribution remain recorded.

### XDP-5 — Complete live authorization

Create the X Developer Project/App, configure the exact callback, install secrets, grant
the approved scopes, and connect `@get_geopulse`.

Acceptance:

- Identity and granted scopes are verified from X.
- Refresh-token rotation is proven.
- No developer credential appears in source control or task output.

### XDP-6 — Run one approved canary

Publish one independently approved post within the channel cap and observe the complete
control-plane lifecycle.

Acceptance:

- The post passes the X rubric and claim/evidence gates.
- The live URL and publication proof are stored.
- Attribution is present and the API charge remains within cap.
- Retries cannot duplicate a provider-accepted post.

## Definition of done

The epic is complete only when XDP-1 through XDP-4 pass focused tests, type-check, build,
security review, and dashboard QA; XDP-5 verifies the real account and token lifecycle;
and XDP-6 proves one approved, attributed, non-duplicated live publication. Until the
founder can complete X Developer terms, MFA, billing, and account consent, XDP-5 and
XDP-6 remain externally blocked rather than simulated.


## Implementation status — 2026-07-29

- XDP-1 through XDP-4 are implemented on `codex/x-direct-publishing-auth`.
- Focused OAuth/encryption/dispatcher/Instagram tests: 35 passed.
- Repository regression suite: 1,560 passed.
- TypeScript and the production Next.js build pass.
- `DISTRIBUTION_TOKEN_ENCRYPTION_KEY` is installed as a protected Worker secret.
- Production browser verification of the new dashboard control awaits merge/deploy.
- XDP-5 and XDP-6 await founder-side X Developer authorization and a separately
  approved canary post.
