# GEO-Pulse AI Search Readiness Report
Site: `cllcenter.com`  
Organization: Canadian Limb Lengthening Center  
Audit date: March 26, 2026  
Overall score: `71/100 (C-)`

## 1. Executive Summary

The audit gave `cllcenter.com` a score of `71/100`. The site has baseline crawlability, but it shows meaningful gaps in extractability, trust, structure, freshness, schema, and image labeling. The most important immediate issue is a low-confidence extractability signal associated with an HTTP `402/403` response, which needs verification before it is treated as a confirmed crawler-blocking problem. Other confirmed issues include a missing home-page H1, outdated visible freshness signals, empty JSON-LD schema, missing security headers, and incomplete alt text coverage.

## 2. Confirmed Audit Findings

- Overall score: `71/100 (C-)`
- Trust score: `50/100`
- Extractability: low-confidence finding associated with an HTTP `402/403` response during LLM processing
- Content freshness: major content appears to show dates from `2022-10-11`
- Home page H1: not found
- Title tag length: approximately `72` characters
- Meta description length: approximately `198` characters
- JSON-LD schema: container present, but no `@type` values detected
- Image alt text coverage: `41%`
- Security headers: HSTS and `X-Content-Type-Options` not detected
- `/llms.txt`: not present
- Home page score: `66/100`
- Core procedure page scores: approximately `64` to `72/100`

## 3. Likely Implications

- **Trust weakness:** A trust score of `50/100` suggests the site may be at a disadvantage in high-sensitivity medical search contexts, where systems are typically more conservative.
- **Low-confidence extractability:** The HTTP `402/403` signal suggests an access, delivery, or bot-handling issue may be interfering with machine retrieval. This needs verification before treating it as a confirmed crawler block.
- **Missing H1:** The absence of a home-page H1 may weaken topic clarity and make the main page harder to classify consistently.
- **Stale freshness signals:** Visible dates from 2022 may reduce confidence in the recency of medical information, especially on procedure-focused pages.
- **Empty schema container:** A JSON-LD container with no `@type` values provides little or no structured meaning to machines.
- **Low alt-text coverage:** Incomplete image labeling may limit machine understanding of visual content such as clinical imagery and diagrams.
- **Missing security headers:** Missing baseline security headers may contribute to lower technical trust signals.

## 4. Priority Actions

### 1. Investigate the HTTP `402/403` extractability signal
- **Issue:** The audit recorded low-confidence extractability associated with an HTTP `402/403` response.
- **Why it matters:** If machine retrieval is being interrupted, AI systems may not be able to use the site as a live source.
- **Action:** Check bot-management rules, CDN behavior, WAF settings, and origin logs to confirm what is generating the response and which user agents are affected.
- **Priority:** Immediate
- **Confidence:** Medium

### 2. Add a clear H1 to the home page
- **Issue:** No H1 was found on the home page.
- **Why it matters:** Without a primary heading, the main page topic is harder to parse consistently.
- **Action:** Add one descriptive H1 that clearly names the organization and primary specialty. Then check service and condition pages for the same issue.
- **Priority:** Immediate
- **Confidence:** High

### 3. Implement meaningful medical schema
- **Issue:** JSON-LD is present, but no `@type` values were detected.
- **Why it matters:** The site is not giving machines structured signals about the business, physicians, or procedures.
- **Action:** Add structured data where it is directly relevant, starting with `MedicalBusiness` on the home page, `Physician` on provider pages, and `MedicalProcedure` on procedure pages.
- **Priority:** Immediate
- **Confidence:** High

### 4. Add missing security headers
- **Issue:** HSTS and `X-Content-Type-Options` were not detected.
- **Why it matters:** Missing baseline security headers may weaken technical trust signals.
- **Action:** Add `Strict-Transport-Security` and `X-Content-Type-Options: nosniff` at the server or CDN layer. Also review whether a CSP with `frame-ancestors` is appropriate.
- **Priority:** Immediate
- **Confidence:** High

### 5. Shorten overlong metadata on key pages
- **Issue:** Title tags and meta descriptions appear longer than recommended display ranges.
- **Why it matters:** Overlong metadata is more likely to be truncated in previews and summaries.
- **Action:** Reduce title tags to a tighter range and shorten meta descriptions to concise, readable summaries. Start with the home page and the main procedure pages.
- **Priority:** Near-term
- **Confidence:** High

### 6. Refresh older procedure content
- **Issue:** Core content appears to show visible dates from 2022.
- **Why it matters:** Older visible freshness signals may reduce confidence in the recency of clinical information.
- **Action:** Review and update priority procedure and condition pages first. Where appropriate, refresh visible update signals and schema-based `dateModified`.
- **Priority:** Near-term
- **Confidence:** High

### 7. Complete missing image alt text
- **Issue:** A majority of images appear to be missing alt text.
- **Why it matters:** Unlabeled images provide little machine-readable context and reduce accessibility.
- **Action:** Audit the image set and add descriptive alt text for clinical imagery, diagrams, and supporting visuals. Keep descriptions factual and specific.
- **Priority:** Near-term
- **Confidence:** High

## 5. Optional Advanced GEO Improvements

These are not required to fix the confirmed audit issues, but they may help later once the core problems are resolved.

- **Add `/llms.txt`:** A lightweight optional step that can provide a cleaner summary of important site content for AI-facing workflows.
- **Add short summary blocks to procedure pages:** A concise factual summary near the top of each key page may improve readability and extraction.
- **Use more question-shaped subheadings:** This may help align page sections with the way patients ask for information.
- **Add structured clinical comparison tables where supportable:** If the clinic has reliable internal data, clearer tables may make important information easier to extract.
- **Track AI citation visibility later:** After technical access and trust issues are addressed, citation monitoring may help measure whether improvements are changing visibility.

## 6. Open Questions and Follow-Up Checks

- **HTTP `402/403` root cause:** The audit observed the signal, but it does not establish whether the cause is bot blocking, rate limiting, access control, or another delivery rule.
- **Trust score breakdown:** The audit returned a trust score of `50/100`, but the specific components behind that score are not yet broken out here.
- **Schema scope:** The audit detected an empty schema container, but a page-level inventory is still needed to confirm whether the issue is universal or uneven.
- **Freshness scope:** The audit surfaced older dates, but a page-by-page review is needed to separate genuinely outdated content from weak freshness signaling.
- **Template consistency:** The home page and procedure pages scored differently; a template-level review would clarify which page types are driving the weaker results most strongly.
