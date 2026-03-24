# API Contracts — GEO-Pulse API v1
> Written by: API agent
> Reviewed by: Architect
> Approved by: Orchestrator
> These contracts are frozen once approved. Breaking changes require a new version (v2).

---

## Design Principles

1. **API-first:** The GEO-Pulse UI consumes this same API. No privileged UI-only endpoints.
2. **Versioned from day one:** All endpoints are under `/api/v1/`. When breaking changes are needed, `/api/v2/` is created; v1 is maintained for 12 months.
3. **Async by default:** Scans are queued and results returned via webhook or polling. No synchronous 30-second waits.
4. **Consistent error shape:** All errors return `{ error: { code, message, details? } }`.
5. **Rate limited per API key:** Free, Pro, and Enterprise tiers have different limits.

---

## Authentication

All API requests require an `Authorization: Bearer {api_key}` header.

API keys are prefixed to indicate tier:
- `gp_free_...` — Free tier (100 scans/month)
- `gp_pro_...` — Pro tier (2,000 scans/month)
- `gp_ent_...` — Enterprise tier (custom limits)

The UI uses a short-lived JWT (Supabase session token) for user-facing endpoints. External API consumers always use API keys.

---

## Endpoints

### POST /api/v1/scans
Submit a URL for an AI Search Readiness audit.

**Request:**
```json
{
  "url": "https://example.com",
  "options": {
    "depth": "basic" | "full",     // basic = free tier; full = paid
    "webhook_url": "https://...",   // optional: POST results here when done
    "include_pages": 1             // 1-3 pages; default 1 (homepage only)
  }
}
```

**Response (202 Accepted):**
```json
{
  "scan_id": "scan_abc123",
  "status": "queued",
  "estimated_duration_seconds": 15,
  "poll_url": "/api/v1/scans/scan_abc123",
  "webhook_registered": true
}
```

**Errors:**
- `400 invalid_url` — URL failed SSRF/format validation
- `402 scan_limit_exceeded` — Monthly quota exhausted
- `429 rate_limited` — Too many requests (per-minute limit)

---

### GET /api/v1/scans/{scan_id}
Poll for scan status and results.

**Response (200 OK — complete):**
```json
{
  "scan_id": "scan_abc123",
  "url": "https://example.com",
  "domain": "example.com",
  "status": "complete",
  "score": 58,
  "letter_grade": "C",
  "benchmark_percentile": 43,
  "checks": [
    {
      "id": "ai_crawler_access",
      "name": "AI Crawler Access",
      "weight": 15,
      "passed": false,
      "finding": "GPTBot is blocked via robots.txt Disallow rule",
      "fix": "Remove or update the Disallow rule for GPTBot in robots.txt"
    }
    // ... 14 more checks
  ],
  "top_issues": [ /* top 3 failing checks */ ],
  "scan_duration_ms": 4200,
  "scanned_at": "2026-03-23T14:00:00Z"
}
```

**Response (200 OK — pending/processing):**
```json
{
  "scan_id": "scan_abc123",
  "status": "queued" | "processing",
  "estimated_seconds_remaining": 10
}
```

---

### GET /api/v1/scans/{scan_id}/report
Download the full PDF report (paid scans only).

**Response:** `Content-Type: application/pdf` — binary PDF stream

**Errors:**
- `402 report_not_purchased` — This scan has no paid report
- `404 not_found` — Scan ID does not exist or belongs to another API key

---

### GET /api/v1/scans
List scans for this API key.

**Query params:** `limit` (default 20, max 100), `offset`, `status` filter

**Response:**
```json
{
  "scans": [ /* array of scan summaries */ ],
  "total": 142,
  "limit": 20,
  "offset": 0
}
```

---

### POST /api/v1/webhooks
Register a webhook endpoint for async scan results.

**Request:**
```json
{
  "url": "https://your-app.com/geo-pulse-webhook",
  "events": ["scan.complete", "scan.failed"],
  "secret": "your-signing-secret"  // used to verify webhook signatures
}
```

**Webhook payload (POST to your URL on scan.complete):**
```json
{
  "event": "scan.complete",
  "scan_id": "scan_abc123",
  "data": { /* full scan result object */ },
  "timestamp": "2026-03-23T14:00:15Z"
}
```

Webhook requests include `X-GeoP-Signature: sha256=...` header for verification.

---

### GET /api/v1/usage
Get current usage for this API key.

**Response:**
```json
{
  "api_key_prefix": "gp_pro_abc",
  "tier": "pro",
  "scans_used": 142,
  "scans_limit": 2000,
  "scans_reset_at": "2026-04-01T00:00:00Z",
  "rate_limit": {
    "requests_per_minute": 30,
    "remaining_this_minute": 28
  }
}
```

---

### DELETE /api/v1/scans/{scan_id}
Delete a scan and its associated data.

---

## Rate Limits by Tier

| Tier | Scans/month | Req/min | Webhook support | PDF reports |
|------|-------------|---------|-----------------|-------------|
| Free (`gp_free_`) | 100 | 10 | ❌ | ❌ |
| Pro (`gp_pro_`) | 2,000 | 30 | ✅ | ✅ |
| Enterprise (`gp_ent_`) | Custom | Custom | ✅ | ✅ |

---

## Error Response Shape

All errors follow this shape:
```json
{
  "error": {
    "code": "invalid_url",
    "message": "The provided URL could not be validated. Only HTTPS URLs to public domains are supported.",
    "details": {
      "url": "http://internal-server/api",
      "reason": "HTTP scheme not allowed — use HTTPS"
    }
  }
}
```

---

## Webhook Signature Verification

```typescript
// Verify incoming webhook in your application:
const signature = request.headers['x-geop-signature'];
const expectedSignature = 'sha256=' + hmacSha256(rawBody, yourWebhookSecret);
if (!timingSafeEqual(signature, expectedSignature)) {
  return 401; // reject
}
```

---

## Versioning Policy

- Current version: `v1`
- Breaking changes require a new version prefix (`/api/v2/`)
- v1 will be maintained for minimum 12 months after v2 launch
- Deprecation notices sent via email and `Sunset` response header
- Additive changes (new fields, new optional parameters) are non-breaking and made in-place
