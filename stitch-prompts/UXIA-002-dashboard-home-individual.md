# UXIA-002 — Dashboard Home: Individual Persona
> Use the shell from UXIA-001. This is the main content area only.

---

## Stitch Prompt

Design the **dashboard home page** for an individual user of **GeoPulse**, an AI search readiness audit platform. This is the main content area rendered inside the dashboard shell (sidebar already designed separately).

The user has signed in, has no active agency or startup workspace — just their personal scan history.

---

### Page Header

- **Eyebrow text:** "Personal workspace" (small caps, muted)
- **H1:** "Your scans"
- **Subtext:** User's email address (muted, small)
- No extra actions in the header

---

### State A: User has scans (show this as the primary state)

**Stats row — 3 cards, horizontal, full-width:**

Each card: rounded-xl, `bg-surface-container`, padding 20px. Contains:
- Label (small caps, muted): e.g., "SCANS"
- Value (bold, 2xl): e.g., "7"

Cards:
1. **SCANS** — 7
2. **AVG SCORE** — 74/100
3. **DEEP AUDITS** — 2

---

**WhatNextBanner — below stats, full-width:**

A softly tinted card (`bg-primary/8 border border-primary/20`, rounded-xl, padding 16px).

Layout: left icon (lightbulb or arrow-right, `text-primary`) + text column + right CTA button.

Text:
- Eyebrow: "WHAT'S NEXT" (small caps, `text-primary`)
- Title: "Ready to go deeper?" (medium weight)
- Body: "Get a full deep audit with implementation steps, PDF report, and priority recommendations."

CTA button: "Upgrade to Deep Audit" — filled primary button, small-medium size

*(For state: user has scans but no deep audit yet)*

---

**Scan list — below banner:**

Label: "Recent scans" (H3, `text-on-surface`)

Each item is a **ScanCard** — horizontal card, rounded-xl, `bg-surface-container`, padding 16px:

Left side:
- Domain name (bold, `text-on-surface`): e.g., "techehealthservices.com"
- Date (small, muted): e.g., "Apr 3, 2026"

Center:
- Score: large number "74" with "/100" suffix (muted)
- Letter grade badge: rounded pill, e.g., "B+" — color-coded:
  - A range: `bg-green-500/20 text-green-400`
  - B range: `bg-blue-500/20 text-blue-400`
  - C range: `bg-yellow-500/20 text-yellow-400`
  - D/F: `bg-red-500/20 text-red-400`

Right side:
- Status badge chip (small, rounded):
  - "Free scan" — neutral muted chip
  - "Report generating" — amber chip with spinner dot
  - "Report delivered" — green chip with checkmark
- Action links (small, ghost style, inline row):
  - "View results" → `/results/[id]`
  - "Download PDF" (only if report delivered) → PDF link
  - "Rescan" (icon button, refresh icon)

Show 4 scan cards with varied states:
1. techehealthservices.com — score 74, grade B+, "Free scan", Apr 3
2. getgeopulse.com — score 91, grade A, "Report delivered", Mar 28
3. aliehealthai.com — score 58, grade C+, "Report generating", Apr 4
4. aurionhealth.com — score 83, grade B+, "Free scan", Apr 1

---

### State B: Empty state (no scans yet)

Replace stats row + scan list with a full-width empty state panel:

Centered content inside a dashed-border rounded-xl card:
- Icon: clipboard or radar (large, `text-primary/50`)
- Title: "No scans yet" (H3)
- Body: "Run your first audit from the sidebar — it takes under 30 seconds and gives you an instant AI search readiness score."
- No link to homepage — just refer to the sidebar

WhatNextBanner (shown above empty state):
- Eyebrow: "START HERE"
- Title: "Run your first audit"
- Body: "Enter any URL to get your AI search readiness score instantly. Free, no account required."
- CTA: "Run a Scan" (links to `/dashboard/new-scan`)

---

### Show both states

Render State A as the primary view and State B as a secondary view below (labeled "Empty state" in Stitch). Both use the same dashboard shell from UXIA-001 in Personal workspace mode.
