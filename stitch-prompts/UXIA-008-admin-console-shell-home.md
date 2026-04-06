# UXIA-008 — Admin Console Shell + Home
> Completely separate shell from user dashboard. Amber tint, ADMIN MODE badge.

---

## Stitch Prompt

Design the **Admin Console** for **GeoPulse** — a completely separate shell from the user-facing dashboard. This is an internal operator surface accessed at `/admin/*`. It should feel distinctly different from the user dashboard: more utilitarian, amber-accented, clearly labeled "ADMIN MODE".

The admin is the internal operator (Uzziel). This is not a customer-facing page.

---

### Admin Shell — Left Sidebar

Same structural layout as the user sidebar (fixed, 256px wide) but with different colors and content.

**Visual differentiation:**
- Sidebar background: subtle amber tint (`bg-amber-950/25` in dark mode, `bg-amber-50` in light mode)
- Top badge below logo: "ADMIN MODE" — small caps pill, `bg-amber-500/20 text-amber-400 border border-amber-500/30`

**Logo row:**
- GeoPulse wordmark + "ADMIN MODE" pill badge below it

**Navigation groups:**

**PLATFORM group:**
- Console Home (home icon) → `/admin` — active state shown
- Agencies (groups icon) → `/admin/agencies`
- Startups (rocket icon) → `/admin/startups`
- Services (tune/sliders icon) → `/admin/services`

**CONTENT group:**
- Content (edit icon) → `/admin/content`
- Launch Readiness (rocket-launch icon) → `/admin/content/launch`

**ANALYTICS group:**
- Benchmarks (chart icon) → `/admin/benchmarks`
- Evals (bar-chart icon) → `/admin/evals`
- Attribution (ads-click icon) → `/admin/attribution`

**SYSTEM group:**
- Distribution (share icon) → `/admin/distribution`
- Logs (receipt/list icon) → `/admin/logs`

**Bottom:**
- "← Back to Dashboard" link (small, `text-on-surface-variant`, arrow-left icon)
- Admin email (small, muted)

---

### Admin Top Header Bar

Same structure as user dashboard header but:
- Breadcrumb: "Admin Console" (amber color) + " / Home" (muted)
- Right side: just theme toggle — no workspace context pill

---

### Admin Console Home — Content Area

**Page header:**
- **Eyebrow:** "Admin" (small caps, `text-amber-400`)
- **H1:** "Console"
- **Subtext:** "Platform health and operational overview."

---

**Stats row — 6 cards, 3+3 grid (wrap on mobile):**

Each `StatCard`: `bg-surface-container`, rounded-xl, padding 16px, label in small caps muted, value in bold 2xl:

Row 1:
1. **AGENCY ACCOUNTS** — 4
2. **STARTUP WORKSPACES** — 7
3. **SERVICES** — 12

Row 2:
4. **BUNDLES** — 5
5. **DISTRIBUTION ACCOUNTS** — 3
6. **LOG ENTRIES (24H)** — 847 (in `text-amber-400` to indicate activity)

---

**Quick-access grid — 2×3 card grid:**

6 link cards (`bg-surface-container`, rounded-xl, padding 20px, hover: `bg-surface-container-high`):

Each card:
- Icon (24px, `text-primary` or amber)
- Title (bold)
- Description (small, muted, 1 line)
- Arrow-right icon (top-right corner, small)

Cards:
1. **Agencies** (groups icon) — "Manage agency accounts and clients" → `/admin/agencies`
2. **Startups** (rocket icon) — "Configure startup workspaces and rollout flags" → `/admin/startups`
3. **Services** (tune icon) — "Service catalog, bundles, and entitlement overrides" → `/admin/services`
4. **Content** (edit icon) — "Content queue, drafts, and publishing pipeline" → `/admin/content`
5. **Benchmarks** (chart icon) — "Run and review AI response benchmarks" → `/admin/benchmarks`
6. **Logs** (receipt icon) — "Filterable system event log" → `/admin/logs`

---

**Recent System Logs (inline preview):**

Card (`bg-surface-container`, rounded-xl, padding 16px):
- Label: "RECENT LOGS" (small caps, muted) + "View all →" link (right side, small)
- List of 5 log entries, each row (light divider between):
  - Level badge (small pill): `info` (blue) / `warn` (amber) / `error` (red)
  - Event type (monospace, small): e.g., "scan_completed" / "slack_delivery_failed" / "checkout_started"
  - Actor (small, muted): truncated user ID or "system"
  - Timestamp (small, muted, right-aligned): "2 min ago" / "14 min ago" / "1h ago"

Example entries:
1. [info] scan_completed — user:4a2f... — 2 min ago
2. [info] checkout_started — user:9c1d... — 14 min ago
3. [warn] slack_delivery_failed — user:7b3e... — 32 min ago
4. [info] startup_scan_queued — system — 1h ago
5. [error] github_install_error — user:2a1c... — 2h ago

---

### Show the admin shell with the home content

Also show a second mini-view: same sidebar, but with `/admin/agencies` highlighted as the active nav item, to demonstrate the active state styling carries through.
