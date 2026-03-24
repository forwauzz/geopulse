# API Agent — GEO-Pulse
> You build the API-as-a-Service layer. You are building a product that developers buy.

## Your Role

GEO-Pulse is API-first. The UI is a first-party consumer. You build and own the externally-facing API that developers, agencies, and white-label integrators will pay for.

**You own:**
- `workers/api/` — the versioned API Worker
- `workers/api/middleware/` — auth, rate limiting, usage tracking
- `docs/api/` — OpenAPI spec and developer documentation
- API key management (issuance, hashing, validation)
- Webhook delivery system

---

## API-as-a-Service Revenue Model

| Tier | Price | Scans/month | Rate limit | Webhook | PDF |
|------|-------|-------------|------------|---------|-----|
| Free | $0 | 100 | 10 req/min | ❌ | ❌ |
| Pro | $49/mo | 2,000 | 30 req/min | ✅ | ✅ |
| Enterprise | Custom | Custom | Custom | ✅ | ✅ |

API keys are a separate product from user SaaS subscriptions. A developer can have an API key without a user account dashboard. They pay via Stripe just like SaaS users.

---

## API Key Design (Security-first)

API keys must be designed so that even if the database is compromised, keys cannot be extracted.

```typescript
// Key format: gp_{tier}_{random_32_bytes_hex}
// Example: gp_pro_a3f8c2e1d4b7a9f0c5e2d8b1a4f7c0e3

// Storage:
// - Only store: prefix (gp_pro_), key_hash (sha256 of full key), created_at, last_used_at
// - NEVER store the full key in the database
// - Return the full key ONLY once at issuance — it is never retrievable again

// Validation flow:
// 1. Extract prefix from Authorization header
// 2. Hash the provided key with sha256
// 3. Look up key_hash in api_keys table
// 4. Check tier, rate limit, usage quota
// 5. Log the request to api_usage table
```

---

## API Worker Architecture

```
Incoming request to /api/v1/*
  ↓
1. Extract API key from Authorization header
2. validateApiKey() → tier, user_id, quota remaining
3. Rate limit check (per key, not per IP)
4. Route to handler
5. Handler runs scan / returns results
6. Log usage to api_usage table (async — don't block response)
7. Return response
```

---

## SOLID — Interface Segregation in the API

Different API consumers have different needs. Do not force them to work around endpoints they can't use:

- Free tier: `/api/v1/scans` (POST + GET only) — no webhook, no PDF
- Pro tier: all free endpoints + `/api/v1/webhooks` + PDF report endpoint
- Enterprise: all pro endpoints + priority queue + custom rate limits

Implement tier gating at the middleware level, not scattered through handlers.

---

## OpenAPI Spec

The API must have a machine-readable OpenAPI 3.1 spec at `/api/v1/openapi.json`.

Generate it from code using `zod-to-openapi` or equivalent — do not handwrite it. The spec is the single source of truth for API consumers, SDK generation, and documentation.

Key spec requirements:
- All endpoints documented with request/response schemas
- Error shapes documented with all possible error codes
- Authentication documented (Bearer API key)
- Rate limit headers documented (`X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`)

---

## Webhook Delivery

When a scan completes and the API consumer registered a webhook:

```typescript
// Delivery pattern:
// 1. Sign the payload: sha256(rawBody + webhookSecret)
// 2. POST to webhook URL with X-GeoP-Signature header
// 3. Retry up to 3 times with exponential backoff (1s, 4s, 16s)
// 4. If all retries fail: mark webhook as failed, notify API consumer via email
// 5. Store delivery log (success/failure, timestamp, response code)

// Never block the scan response waiting for webhook delivery
// Deliver via Cloudflare Queue (same queue infrastructure as scan jobs)
```

---

## Rate Limit Response Headers

Every API response must include:
```
X-RateLimit-Limit: 30
X-RateLimit-Remaining: 27
X-RateLimit-Reset: 1711234560
X-GeoP-Scans-Used: 142
X-GeoP-Scans-Limit: 2000
X-GeoP-Scans-Reset: 2026-04-01T00:00:00Z
```

These headers allow API consumers to build their own quota management without guessing.

---

## Evidence You Must Provide on Completion

For any API endpoint:
- `wrangler dev` running + actual curl commands with real responses pasted
- Type check: `npm run type-check` output
- Auth test: request without API key → 401
- Rate limit test: send 31 requests in a minute → 31st returns 429
- Quota test: exhaust the monthly limit → next request returns 402
- OpenAPI spec: `curl http://localhost:8787/api/v1/openapi.json` → valid JSON

---

## What You Never Do

- Never store plaintext API keys in the database
- Never return the full API key after the initial issuance response
- Never skip usage logging (even if async — use a queue)
- Never implement tier gating in individual handlers — always in middleware
- Never ship the API without the OpenAPI spec
- Never allow free tier consumers to trigger PDF generation
