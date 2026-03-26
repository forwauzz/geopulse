# Verification And Evidence

## Latest Verified Commands

### Type check
```text
> geo-pulse@0.1.0 type-check
> tsc --noEmit
```

### DA-005 targeted Vitest
```text
RUN  v4.1.1 C:/Users/Carine Tamon/Desktop/CLAUDE WORKSPACE/projects/geopulse/geo-pulse

Test Files  3 passed (3)
     Tests  20 passed (20)
Start at  07:01:42
Duration  611ms
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
- AU-001 to AU-010
- RE-001 to RE-007
- DA-004 incremental entries
- T3-7
- DA-005

## Security Truths

Security reference:
- `SECURITY.md`
- `agents/SECURITY_AGENT.md`

Current posture:
- SSRF protections implemented and documented truthfully
- Browser Rendering is guarded, opt-in, and uses validated URLs only
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

Targeted DA-005 validation:
1. `npm exec vitest run workers/scan-engine/browser-rendering.test.ts workers/scan-engine/deep-audit-crawl.test.ts lib/server/stripe/checkout-completed.test.ts`
2. `npm run build`
