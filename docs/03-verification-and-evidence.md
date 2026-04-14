# Verification And Evidence

## Latest Verified Commands

### Type check
```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

### Guided journey targeted Vitest
```text
RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

Test Files  1 passed (1)
     Tests  5 passed (5)
Start at  16:53:05
Duration  839ms
```

### Results/report action targeted verification
```text
Type check passes, the updated results-journey Vitest slice passes, and Playwright smoke now covers checkout-return messaging, share snapshot copy fallback, interactive report render, and PDF-only report fallback.
```

### Benchmark admin targeted verification
```text
Type check passes and targeted benchmark admin Vitest plus Playwright smoke coverage are used for the benchmark admin routes that changed.
```

### Phase 4 security targeted Vitest
```text
RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

Test Files  5 passed (5)
     Tests  25 passed (25)
```

### DA-005 targeted Vitest
```text
RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

Test Files  3 passed (3)
     Tests  20 passed (20)
Start at  07:01:42
Duration  611ms
```

### DA-004 targeted Vitest
```text
RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

Test Files  1 passed (1)
     Tests  7 passed (7)
Start at  14:15:22
Duration  489ms
```

### Production build
```text
> geo-pulse@0.1.0 build
> next build

Compiled successfully
Route (app)
... /results/[id]/report 47.2 kB 153 kB
```

## Verification Sources

Primary evidence log:
- `agents/memory/COMPLETION_LOG.md`

Automated CI:
- `.github/workflows/ci.yml`

Important implemented evidence entries:
- Phase 0 gate bundle
- Phase 1 implementation bundle
- Phase 4 launch bundle
- UX-001
- UX-002 ... UX-007
- UX-008
- AU-001 to AU-010
- RE-001 to RE-007
- RE-011 to RE-018
- DA-004 incremental entries
- DA-004 completion entry
- T3-7
- DA-005
- BM-041
- BM-042
- BM-043
- BM-044
- BM-045
- BM-046

## Security Truths

Security reference:
- `SECURITY.md`
- `agents/SECURITY_AGENT.md`

Current posture:
- SSRF protections implemented and documented truthfully
- Browser Rendering is guarded, opt-in, and uses validated URLs only
- payment/report state UX is now driven by stored payment/report truth on the results page
- launch is still blocked on DNS + sign-off + WAF decision

## Operator-Sensitive Areas

Require real-world operator evidence, not just code:
- production deploy status
- Stripe live configuration
- SPF / DKIM / DMARC
- WAF managed rule status
- launch security sign-off

## How To Re-Verify Quickly

1. `npm run type-check`
2. `npm run test`
3. `npm run build`
4. `npm run eval:smoke`
5. `npm run eval:promptfoo`
6. `npm run eval:retrieval:write -- --site-url https://example.com`

Targeted DA-005 validation:
1. `npm exec vitest run workers/scan-engine/browser-rendering.test.ts workers/scan-engine/deep-audit-crawl.test.ts lib/server/stripe/checkout-completed.test.ts`
2. `npm run build`

Targeted guided-journey validation:
1. `npx vitest run lib/client/results-journey.test.ts`
2. `npm run build`
