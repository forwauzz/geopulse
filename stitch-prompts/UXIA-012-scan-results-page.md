# UXIA-012 — Scan Results Page
> /results/[id] — the most important conversion page. Redesign with clear step framing.

---

## Stitch Prompt

Design the **Scan Results page** at `/results/[id]` for **GeoPulse**. This is the first page a user sees after running a scan. It must do three things clearly: show the score, surface the key issues, and present one obvious next step.

This is a **public page** — accessible without login. It has a shareable URL. The design must work for:
- Anonymous visitors who ran a free scan
- Signed-in users viewing their own scan
- Anyone with the share link

---

### Layout

Max-width 768px, centered, single column, with generous vertical spacing. No sidebar — this is a public page, just top navigation.

---

### Top Navigation (simple public nav)

Full-width, `bg-background/80 backdrop-blur border-b border-outline-variant`, height 48px:
- Left: GeoPulse logo wordmark
- Right: "Sign in" link + "Pricing" link + theme toggle icon

---

### Section 1 — Score Hero

Large centered score display:

- **Domain name** (H2, bold): "acmehealth.com"
- **Scan date** (small, muted): "Apr 5, 2026"
- **Score ring** (SVG circle, 120px): outer ring = `text-outline-variant`, inner progress ring = colored by grade. Center text: score number in large bold.
- **Letter grade badge** (below ring, large pill): e.g., "B+" — same color coding as UXIA-002
- **Score label** (small, muted): "AI Search Readiness Score"

Color guide:
- A (85-100): green ring
- B (70-84): blue ring
- C (55-69): yellow ring
- D/F (0-54): red ring

Show score: 68, grade C+, yellow ring.

---

### Section 2 — Category Breakdown

Label: "Score by category" (H3)

3-4 column grid of category cards. Each card (`bg-surface-container`, rounded-xl, padding 12px):
- Category name (bold, small): "Schema & Structure"
- Score (large): 72/100
- Grade badge (small): "B-"
- Check count (small, muted): "8 of 11 checks passed"

Categories to show (4):
1. Schema & Structure — 72/100 — B- — 8/11 passed
2. Content Clarity — 61/100 — C+ — 5/9 passed
3. LLM Extractability — 55/100 — C — 4/8 passed
4. Technical Readiness — 84/100 — B+ — 10/12 passed

---

### Section 3 — Issues List

Label: "Key findings" (H3)

List of 5 issue cards. Each card (`bg-surface-container`, rounded-xl, padding 16px):

- **Check name** (bold): e.g., "FAQ schema markup"
- **Finding** (body, `text-on-surface`): "No FAQ or HowTo schema detected. AI engines cannot extract structured Q&A pairs."
- **Fix** (small, muted, with wrench icon): "Add JSON-LD FAQ schema to pages with Q&A content."
- **Weight badge** (small, right-aligned): "High impact" (red) / "Medium" (amber) / "Low" (muted)
- **Status indicator** (left side, colored dot): passed = green dot, failed = red dot

Show 5 issues (mix of failed and 1 passed):
1. [failed, high] FAQ schema markup — "No FAQ or HowTo schema detected..."
2. [failed, high] Meta description length — "12 pages have descriptions exceeding 160 characters..."
3. [failed, medium] Author entity markup — "No Person or Organization schema found on article pages..."
4. [failed, medium] Internal link density — "Average 1.2 internal links per page — below the 5 recommended threshold..."
5. [passed, medium] HTTPS enforcement — "All pages redirect to HTTPS. No mixed content detected."

---

### Section 4 — Action Card (The "What's next" moment)

This is the most critical section. A prominent card with clear step framing.

Full-width card, `bg-surface-container border border-outline-variant`, rounded-2xl, padding 24px:

**State A — Anonymous user, no deep audit purchased:**
- **Eyebrow:** "STEP 1 OF 3" (small caps, `text-primary`)
- **Title:** "Save your scan"
- **Body:** "Sign in with your email to save this scan and track improvements over time. Free, no credit card required."
- **CTA:** "Sign in to save" (filled primary, full-width)
- **Secondary link:** "Skip for now — get the full report →"

**State B — Anonymous user, wants deep audit (shows after clicking "get full report"):**
- **Eyebrow:** "STEP 2 OF 3" (small caps, `text-primary`)
- **Title:** "Get the full deep audit"
- **Body:** "A complete PDF report with prioritized implementation steps, technical fixes, and content recommendations. One-time payment."
- **Price:** "$29 one-time" (bold, large)
- **CTA:** "Get the Deep Audit — $29" (filled primary, full-width)
- **Secondary link:** "← Back"

**State C — Signed-in user, report generating:**
- **Eyebrow:** "GENERATING REPORT" (small caps, amber)
- **Title:** "Your deep audit is being prepared"
- **Body:** "This usually takes 2–5 minutes. You'll receive an email when it's ready."
- **Progress indicator:** subtle animated pulse or spinner line
- **Secondary link:** "Go to dashboard"

**State D — Report delivered:**
- **Eyebrow:** "COMPLETE" (small caps, green)
- **Title:** "Your report is ready"
- **Body:** "Download your full deep audit PDF or view the structured report online."
- **CTA 1:** "Download PDF" (filled primary)
- **CTA 2:** "View online report" (ghost, outlined)

---

### Show four states

Show State A as the primary view. Show States B, C, D below it as secondary states labeled "State B", "State C", "State D".

The overall page (score + categories + issues + action card) is shown once in full using State A. States B/C/D show only the action card component in each state.
