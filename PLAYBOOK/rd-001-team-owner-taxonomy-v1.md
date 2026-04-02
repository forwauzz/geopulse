# RD-001 — Team Owner Taxonomy v1

Last updated: 2026-03-30

## Purpose

Map every audit check to a primary team owner so that future report sections (executive brief, action map, immediate wins) can group findings by who is responsible for acting on them — not by technical category.

This is the load-bearing prerequisite for RD-002 (executive brief), RD-005 (section order), and RD-006 (immediate wins format).

## Scope constraints (Phase A)

- This document defines owners for the 22 currently implemented checks only.
- It does not define owners for future checks not yet built.
- It does not change the runtime or any check implementation.
- It does not change the current category scoring system (`ai_readiness`, `extractability`, `trust`, `demand_coverage`, `conversion_readiness`).
- Owner assignments are based on who is accountable for the fix in a typical organization — not who originally configured the tag.

## The four owners

| Owner | Who this is | What they control |
|-------|-------------|-------------------|
| **Engineering** | Dev team, backend/frontend engineers, DevOps | Server config, code-level implementation, infrastructure, technical directives |
| **Content** | Content team, copywriters, SEO editors, content strategists | What is written, how it is structured, page maintenance, editorial linking practices |
| **Brand** | Brand/marketing team, brand managers, communications | Organizational identity presentation, trust and credibility signals, how the brand appears when shared |
| **Product** | Product managers, growth team, CRO | Conversion signals, business information, user journey clarity |

## Ambiguity rule

When a check could belong to two owners, assign the primary owner as the team whose **decision** drives whether the check passes or fails — not the team whose hands implement it.

Example: Title tag copy is an **Content** decision even though Engineering implements the `<title>` element in a template. The check fails or passes based on what the title says, not whether the tag element exists in HTML.

## Check-to-owner mapping

### Engineering (11 checks)

These checks fail because of missing or misconfigured server directives, technical declarations, or infrastructure settings. A developer must act.

| Check ID | Check Name | Weight | Current Category | Why Engineering |
|----------|-----------|--------|-----------------|-----------------|
| `ai-crawler-access` | AI crawler access (robots.txt) | 10 | ai_readiness | robots.txt is a server file; blocking or unblocking specific user-agents is a dev/ops decision |
| `llms-txt` | llms.txt presence | 6 | ai_readiness | File must be deployed at the domain root — a server/code deployment action before content can matter |
| `json-ld` | Structured data (JSON-LD) | 8 | extractability | Adding `<script type="application/ld+json">` blocks requires code changes in templates or CMS |
| `schema-types` | Schema.org type coverage | 4 | extractability | Depends on `json-ld` being implemented; the @type values are set in code or template configuration |
| `security-headers` | Security response headers | 2 | ai_readiness | HSTS, X-Content-Type-Options, X-Frame-Options are set at the server/CDN layer |
| `snippet-eligibility` | Snippet eligibility | 6 | extractability | nosnippet and max-snippet directives live in meta tags or X-Robots-Tag headers — an engineering configuration |
| `canonical` | Canonical URL | 4 | ai_readiness | `rel=canonical` is declared in the page template or CMS configuration |
| `robots-meta` | Robots meta (AI visibility) | 7 | ai_readiness | Meta robots `noindex`/`none` is a template-level directive; removing it requires a code or CMS change |
| `https-only` | HTTPS URL | 4 | ai_readiness | SSL/TLS configuration and HTTP→HTTPS redirect are infrastructure decisions |
| `viewport` | Mobile viewport | 2 | ai_readiness | `<meta name="viewport">` is a template-level technical tag |
| `html-size` | HTML payload size | 3 | ai_readiness | Reducing HTML bloat requires build optimization, template cleanup, or script deferral |

**Engineering total weight: 56**

---

### Content (9 checks)

These checks fail because of what is written, how pages are structured, or whether content is maintained. A content/editorial team must act.

| Check ID | Check Name | Weight | Current Category | Why Content |
|----------|-----------|--------|-----------------|-------------|
| `llm-qa-pattern` | Q&A / instructional structure (LLM) | 10 | extractability | Whether a page has clear Q&A or step-by-step structure is a writing and editorial decision |
| `llm-extractability` | Content extractability (LLM) | 7 | extractability | Whether content contains concrete facts vs marketing language is a content quality decision |
| `heading-structure` | Heading structure | 5 | extractability | Using one clear H1 and organizing content under H2/H3 is an editorial practice |
| `title-tag` | Title tag | 4 | extractability | The title copy — concise, specific, and page-relevant — is a content decision |
| `meta-description` | Meta description | 4 | extractability | Writing a clear page summary for meta description is copywriting work |
| `freshness` | Content freshness signals | 3 | trust | Keeping content current and updating `dateModified` signals is a content maintenance practice |
| `internal-links` | Internal linking | 6 | extractability | Linking related pages within content is an editorial practice |
| `external-links` | External authority links | 3 | trust | Citing external sources in content is an editorial/research decision |
| `alt-text` | Image alt text coverage | 3 | extractability | Writing descriptive alt attributes is a content/accessibility responsibility |

**Content total weight: 45**

---

### Brand (2 checks)

These checks fail because of how the organization presents itself for credibility and how the brand appears when shared. A brand or communications team must act.

| Check ID | Check Name | Weight | Current Category | Why Brand |
|----------|-----------|--------|-----------------|-----------|
| `eeat-signals` | E-E-A-T signals (authorship & trust) | 6 | trust | Author attribution and About page credibility are organizational identity decisions — who is behind the site, what expertise they hold, and how that is communicated |
| `open-graph` | Open Graph basics | 4 | extractability | og:title and og:description control how the brand appears in link previews and social sharing — a brand representation surface |

**Brand total weight: 10**

---

### Product (0 checks — gap noted)

No currently implemented checks map primarily to Product.

The Product owner category is reserved for checks that will cover: conversion signals, CTA presence, structured business contact information, service/pricing clarity, and user-journey legibility for AI systems.

The current audit has a `conversion_readiness` category in its scoring system but no checks are yet implemented under it. This is a known gap in audit coverage — not a gap in the taxonomy.

**Product total weight: 0 (no checks implemented)**

---

## Summary table

| Owner | Check count | Total weight | % of total weight |
|-------|-------------|-------------|-------------------|
| Engineering | 11 | 56 | 50.5% |
| Content | 9 | 45 | 40.5% |
| Brand | 2 | 10 | 9.0% |
| Product | 0 | 0 | 0% (gap) |
| **Total** | **22** | **111** | **100%** |

---

## Ambiguous assignments — decision record

These checks had meaningful overlap and required an explicit call.

| Check ID | Alternative owner considered | Decision | Reason |
|----------|------------------------------|----------|--------|
| `llms-txt` | Content (writes the file content) | **Engineering** | The file must exist at the domain root before content matters. The blocking failure mode is "file not present" — a deployment decision. |
| `title-tag` | Engineering (implements the `<title>` template) | **Content** | The check evaluates the copy — length and specificity. A template can exist and the check still fails because the title is empty or generic. The fix is editorial. |
| `meta-description` | Engineering (implements the `<meta>` tag) | **Content** | Same reasoning as title-tag. The failure is almost always a missing or poor description, not a missing template slot. |
| `open-graph` | Engineering (implements og: meta tags) | **Brand** | OG tags define how the brand appears when shared. The values — title copy, description — are brand messaging decisions. Engineering implements the tag; Brand owns the surface. |
| `eeat-signals` | Content (writes the About page) | **Brand** | Author attribution and About pages establish organizational credibility and expertise. This is a brand positioning decision — who the organization claims to be — not just a content writing task. |
| `freshness` | Engineering (implements datePublished/dateModified in JSON-LD) | **Content** | The check measures whether content is kept current, not whether the date markup schema is correct. The fix is content maintenance — review and update stale pages. Engineering assists with date markup, but Content drives the practice. |

---

## How to use this taxonomy

### In the report action map (RD-010, future)

Group findings by owner so a CRO reading the report can forward each section to the right team lead:

> "Engineering: 4 items need your attention."
> "Content: 3 items need your attention."
> "Brand: 1 item needs your attention."

### In immediate wins framing (RD-006, future)

Prefer Content and Engineering wins for "Immediate" because those teams have clear ownership and implementation paths. Brand wins tend to be "Near-term" unless the About page is missing entirely.

### When a new check is added

Before shipping a new check, assign it a primary owner in this file and add it to the appropriate section. Keep the summary table up to date.

---

## Non-goals for this slice

- Does not define the report section order (RD-005)
- Does not define the executive brief template (RD-002)
- Does not define the immediate wins format (RD-006)
- Does not change any runtime check logic
- Does not change the existing category scoring system
- Does not introduce any new checks

## Depends on

Nothing — this is the first design slice.

## Required by

- `RD-002` Executive Brief contract (needs to know which owners drive which findings)
- `RD-005` Section order contract (Team Action Map depends on this taxonomy)
- `RD-006` Immediate Wins format (owner assignment determines ticket routing)
