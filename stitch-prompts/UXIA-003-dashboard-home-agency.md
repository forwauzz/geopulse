# UXIA-003 — Dashboard Home: Agency Persona
> Use the shell from UXIA-001 in Agency workspace mode.

---

## Stitch Prompt

Design the **dashboard home page** for an agency user of **GeoPulse**. This is a marketing/SEO agency that manages multiple clients. The sidebar workspace switcher already shows "Agency: Lifter" with client chips below it (from UXIA-001 shell).

This is the main content area only.

---

### Workspace Context Bar (top of content area)

A full-width context banner, `bg-surface-container`, rounded-xl, padding 16-20px:

- **Eyebrow:** "Agency workspace" (small caps, muted)
- **H2:** "Lifter" (account name, bold)
- **Status badges** (inline, small chips): "status: active" (green), "billing: pilot" (amber)

Below the H2, a horizontal **client switcher chip row**:
- "All clients" chip (neutral, currently inactive)
- "Clinic A" chip — **active** (filled primary color, white text)
- "Clinic B" chip (outlined, muted)
- "Clinic C" chip (outlined, muted)

Clicking a chip updates the dashboard context. Only one chip active at a time.

---

### Stats row — 4 cards (scoped to selected client "Clinic A"):

1. **AGENCY SCANS** — 12
2. **DEEP AUDITS** — 3
3. **CLIENT** — "Clinic A"
4. **ICP** — "orthopedics" (icp_tag value)

---

### WhatNextBanner

Tinted card (`bg-primary/8 border border-primary/20`):
- Eyebrow: "WHAT'S NEXT"
- Title: "Run a scan for Clinic A"
- Body: "Every audit builds the baseline for this client's AI search readiness. Results are scoped to their domain."
- CTA button: "Run a Scan for Clinic A"

---

### Client management section (collapsed by default)

A disclosure toggle row: "Manage clients" (small, `text-on-surface-variant`) with a chevron-right icon. Clicking expands an inline panel with:
- A compact "Add client" form (client name input + domain input + Add button)
- A small table: Client name | Domain | Status | Actions
- Not expanded in the primary view — show it collapsed

---

### Scan list (scoped to Clinic A)

Label: "Clinic A — recent scans" (H3)

Same ScanCard layout as UXIA-002 plus:
- A small client label chip ("Clinic A") on each card (left side, below domain name)
- "Report delivered" / "Deep audit linked" badges where applicable

Show 3 scans:
1. clinica.com — score 68, grade C+, "Free scan", Apr 3
2. clinica.com — score 71, grade B-, "Report delivered", Mar 15
3. clinica.com/services — score 79, grade B+, "Free scan", Mar 1

---

### State: No client selected

When "All clients" is selected (no specific client), replace stats + scan list with:

**WhatNextBanner:**
- Title: "Select a client to view their audit history"
- Body: "Choose a client from the chips above to see their scans and run a targeted audit."
- No CTA button

**Empty scan list:** Replace with muted centered text: "Select a client above to see their scans."

---

### Show two states

1. **Primary:** "Clinic A" selected — stats + scans + WhatNextBanner shown
2. **Secondary (below):** "All clients" selected — empty instructional state

Both use the dashboard shell in Agency workspace mode.
