# UXIA-005 — New Scan Page
> Use the shell from UXIA-001. This replaces the broken "New scan → homepage" pattern.

---

## Stitch Prompt

Design the **New Scan page** for **GeoPulse** at `/dashboard/new-scan`. This is an in-dashboard page — it uses the full dashboard shell (sidebar + header). It is context-aware: it shows the current workspace scope before the form.

This page must always feel like: "I know where I am, I'm about to run a scan for [context], and it's one action."

---

### Page Header

- **Breadcrumb** (top header bar): "Dashboard / New Scan"
- **H1:** "Run a scan"
- **Subtext (muted):** "Enter any URL to get an instant AI search readiness score."

---

### Context Card (shown when workspace context is active)

A compact context indicator card directly above the scan form. `bg-surface-container-low border border-outline-variant`, rounded-xl, padding 12px 16px.

**Three variants — show all three as separate states:**

**Variant A — No workspace (personal):**
- No context card shown. Just the form.

**Variant B — Agency context:**
- Icon: briefcase
- Label (muted small): "Scanning for"
- Value (bold): "Lifter / Clinic A"
- Sub-chips: "Agency: Lifter" chip + "Client: Clinic A" chip (small, outlined)
- A small "Change" text link to switch client context

**Variant C — Startup context:**
- Icon: rocket
- Label (muted small): "Scanning for"
- Value (bold): "Acme Health"
- Sub-chip: "Startup workspace" chip
- A small "Change" text link

---

### Scan Form Card

Centered card, max-width 560px, `bg-surface-container`, rounded-2xl, padding 32px:

**URL input field:**
- Label: "Website URL" (bold, `text-on-surface`)
- Input: full-width, rounded-xl, `bg-surface-container-high`, placeholder: "https://yoursite.com"
- Below input (small, muted): "We'll scan the homepage and key pages for AI readiness signals."

**Turnstile CAPTCHA placeholder:**
- A small gray placeholder widget below the input (rounded, `bg-surface-container-high`, height 64px) labeled "Security check — Cloudflare Turnstile"

**Submit button:**
- Full-width, filled primary, rounded-xl, height 48px
- Label: "Run AI Readiness Scan"
- Icon: arrow-right or scan/radar icon on the right

**Loading state** (show as a secondary variant):
- Button becomes disabled with a spinner + "Scanning..." text
- A muted progress message below: "This usually takes 10–30 seconds"

---

### WhatNextBanner (above the form card)

Pre-scan tip banner — subtle, `bg-surface-container-low border border-outline-variant`, rounded-xl, padding 12px 16px:

- Icon: info circle (`text-primary`)
- Text: "Your scan checks 15+ AI readiness signals including schema markup, content clarity, page structure, and LLM extractability."
- No CTA needed

---

### Layout

Centered layout, max-width 640px, vertically centered in the content area (or top-aligned with generous padding):

Top to bottom:
1. Page header (H1 + subtext)
2. WhatNextBanner (pre-scan tip)
3. Context Card (if workspace active)
4. Scan Form Card

---

### Show three states

1. **Personal** — no context card, just tip + form
2. **Agency context (Lifter / Clinic A)** — context card with agency+client + form
3. **Startup context (Acme Health)** — context card with workspace + form

All three use the dashboard shell from UXIA-001.
