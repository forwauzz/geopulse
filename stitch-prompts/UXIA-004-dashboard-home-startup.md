# UXIA-004 — Dashboard Home: Startup Persona
> Use the shell from UXIA-001 in Startup workspace mode.

---

## Stitch Prompt

Design the **dashboard home page** for a startup founder using **GeoPulse**. They have a startup workspace with scans, GitHub connected, Slack connected. This is the most data-rich dashboard view.

This is the main content area only, inside the dashboard shell.

---

### Workspace Context Bar

Full-width bar, `bg-surface-container`, rounded-xl, padding 16-20px:

- **Eyebrow:** "Startup workspace" (small caps, muted)
- **H2:** "Acme Health" (workspace name, bold)
- **Metadata chips** (small, outlined, inline row):
  - "acme-health" (workspace key, monospace font chip)
  - "acmehealth.com" (canonical domain)
  - "role: founder" (role chip, `bg-primary/15 text-primary`)

---

### Stats row — 4 cards:

1. **SCANS** — 14
2. **AVG SCORE** — 68/100
3. **RECOMMENDATIONS** — 47
4. **OPEN** — 23 (open recommendations, in `text-amber-400`)

---

### WhatNextBanner — "What's next" guided step

Since GitHub and Slack are both connected, show the "all connected" state:

- Eyebrow: "WHAT'S NEXT"
- Title: "Everything is connected. Review your backlog."
- Body: "You have 23 open recommendations. Queue a PR run to start automating fixes via GitHub."
- CTA: "View Backlog" (scrolls down to action backlog section)

*(Show this as the primary state. Include a note below the prompt for other states.)*

---

### Two-column widget grid (below stats + banner)

Left column and right column, each 50% width, gap between them.

**Left widget — Score Trend:**

Card (`bg-surface-container`, rounded-xl, padding 16px):
- Label: "Score trend" (small caps, muted)
- SVG sparkline chart: a smooth upward-trending line, light blue stroke, showing 6 data points
  - Data: 54 → 58 → 63 → 65 → 68 → 71
- Date chips below the chart (small pills): "Mar 7", "Mar 14", "Mar 21", "Mar 28", "Apr 3", "Apr 5"
- Trend summary below dates: "+17 pts over 30 days" in `text-green-400 text-sm`

**Right widget — Action Backlog:**

Card (`bg-surface-container`, rounded-xl, padding 16px):
- Label: "Action backlog" (small caps, muted) + count badge "23 open"
- List of 5 backlog items, each row:
  - Priority badge (small pill): "high" (`bg-red-500/20 text-red-400`) or "medium" (`bg-amber-500/20 text-amber-400`)
  - Item title (bold, `text-on-surface`): e.g., "Add FAQ schema markup"
  - Item detail (small, muted): e.g., "Missing structured data — affects 3 pages"

Backlog items to show:
1. [high] "Add FAQ schema markup" — "Missing structured data — affects 3 pages"
2. [high] "Fix meta description length" — "12 pages have truncated descriptions"
3. [medium] "Add author entity markup" — "E-E-A-T signal missing on all articles"
4. [medium] "Improve page speed score" — "Score 52 — LCP above threshold"
5. [medium] "Add internal links to hub pages" — "Orphaned topic pages detected"

---

### Second two-column grid

**Left — Implementation Lanes:**

Card (`bg-surface-container`, rounded-xl, padding 16px):
- Label: "Implementation lanes" (small caps, muted)
- 3 lane mini-cards in a row:

Each lane mini-card (rounded-lg, `bg-surface-container-high`, padding 12px):
- Lane name (bold): "Engineering" / "Content" / "SEO"
- Stats row: "8 open · 4 done · 12 total" (small, muted)
- Mini task list (top 3 tasks, each with a checkbox and title, small font)

Lane data:
- Engineering: 8 open, 4 done → tasks: "Implement schema markup", "Fix canonical tags", "Add hreflang"
- Content: 6 open, 7 done → tasks: "Update FAQ sections", "Add author bios", "Refresh meta descriptions"
- SEO: 9 open, 2 done → tasks: "Internal linking audit", "Image alt text", "Page speed fixes"

**Right — PR Activity:**

Card (`bg-surface-container`, rounded-xl, padding 16px):
- Label: "PR automation" (small caps, muted)

Funnel stats grid (2x3 cells, small, `bg-surface-container-high` chips):
- "Suggested: 12" | "Approved: 5"
- "In progress: 3" | "Shipped: 8"
- "Validated: 6" | "Failed: 1" (in `text-red-400`)

Impact windows (3 stat chips inline): "7d avg: +4 pts" · "14d avg: +9 pts" · "30d avg: +17 pts" (all in `text-green-400`)

PR runs list — 3 rows, each with:
- Status badge: "shipped" (green) / "in progress" (blue) / "failed" (red)
- Title: "PR #47 — schema markup batch"
- Date: "Apr 4, 2026"
- Link: "View PR" (small ghost link)

---

### Empty state (no scans yet)

Show as a secondary state below the primary. Replace all widgets with a full-width empty article card:

- Icon: chart/graph (large, muted)
- Title: "No startup scans yet"
- Body: "Run a scan to populate your score trend, action backlog, and implementation lane tracking."
- CTA: "Run a new scan" → `/dashboard/new-scan?workspaceType=startup&workspace=ID`

WhatNextBanner in empty state:
- Title: "Start here — run your first scan"
- Body: "Every insight in this dashboard comes from your audit data. Run your first scan to unlock the full picture."
- CTA: "Run a Scan"

---

### Show two states

1. **Primary:** Connected startup with 14 scans, score trend, backlog, lanes, PR activity
2. **Secondary (below):** Empty state — 0 scans, step-1 WhatNextBanner
