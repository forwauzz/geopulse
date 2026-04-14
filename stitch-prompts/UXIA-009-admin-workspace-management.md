# UXIA-009 — Admin Workspace Management
> Two pages: /admin/agencies and /admin/startups. Same pattern, different data.

---

## Stitch Prompt

Design the **Admin Workspace Management pages** for **GeoPulse**. There are two pages with the same layout pattern:
1. `/admin/agencies` — manage agency accounts and their clients
2. `/admin/startups` — manage startup workspaces

Show `/admin/agencies` as the primary design. Note that `/admin/startups` uses the same layout with different fields.

Both use the Admin Console shell from UXIA-008.

---

### Page Header (Agencies)

- **Eyebrow:** "Admin" (small caps, `text-amber-400`)
- **H1:** "Agency control"
- **Subtext:** "Create and configure agency accounts, clients, and access."

---

### Layout

Two-column grid on desktop (left: forms, right: accounts list). Stacks to single column on mobile.

Left column (~40%): Form cards
Right column (~60%): Account list

---

### Left Column — Form Cards

Each form is a `AdminFormCard`: `bg-surface-container`, rounded-xl, padding 20px, `H3` label at top.

**Form 1 — Create agency account:**
- Title: "Create agency account"
- Fields (each with label + input, stacked):
  - Account key (input, monospace, placeholder "lifter-agency")
  - Account name (input, placeholder "Lifter Marketing")
  - Website domain (input, placeholder "liftermarketing.com")
  - Canonical domain (input, placeholder "liftermarketing.com")
  - Benchmark vertical (input, placeholder "healthcare")
  - Benchmark subvertical (input, placeholder "orthopedics")
- Submit button: "Create account" (filled primary, full-width)
- Success/error message area below button

**Form 2 — Add client:**
- Title: "Add client"
- Fields:
  - Agency account (dropdown selector)
  - Client key (input)
  - Client name (input)
  - Display name (input)
  - Website domain (input)
  - Vertical + subvertical (inputs)
  - ICP tag (input)
- Submit: "Add client"

**Form 3 — Set feature flag:**
- Title: "Set feature flag"
- Fields:
  - Agency account (dropdown)
  - Client (dropdown, optional — "Account-level")
  - Flag key (dropdown): agencyDashboardEnabled / scanLaunchEnabled / reportHistoryEnabled / deepAuditEnabled / geoTrackerEnabled
  - Enabled (dropdown): true / false
- Submit: "Save flag"

**Flag reference table** (below Form 3, muted box):
Small table: Flag key | Default | Description

| Flag | Default | Description |
|---|---|---|
| agencyDashboardEnabled | false | Access to agency dashboard |
| scanLaunchEnabled | false | Can initiate scans |
| reportHistoryEnabled | false | Access to report archive |
| deepAuditEnabled | false | Can purchase deep audits |
| geoTrackerEnabled | false | Geo tracking feature |

---

### Right Column — Accounts List

Label: "Agency accounts" (H3)

Each account is an **expandable card** (`bg-surface-container`, rounded-xl):

**Collapsed state** (default):
- Account name (bold): "Lifter"
- Account key chip (monospace, small): "lifter-agency"
- Status badge: "active" (green) / "pilot" (amber)
- Billing badge: "pilot_exempt" / "invoice" / "public_checkout"
- Expand chevron button (right side)

**Expanded state** (on click):
- Clients table (small, `bg-surface-container-low`, rounded-lg):
  - Columns: Client name | Domain | ICP | Status | Actions
  - 2-3 rows of clients with data

- Feature flags list (inline key: value chips)
- Agency users list (email | role | status)

Show one account fully expanded: "Lifter" with 2 clients.

---

### /admin/startups variant (show as secondary screen below)

Same two-column layout. Different forms:

Left column forms:
1. **Create startup workspace:** workspaceKey, name, canonicalDomain, bundleKey (dropdown: startup-pilot / startup-pro), planMode (dropdown: free / paid / trial). Submit: "Create workspace"
2. **Add workspace user:** workspace selector, email input, role dropdown (founder/admin/member/viewer). Submit: "Add user"
3. **Update rollout flags:** workspace selector + 5 checkboxes (startup_dashboard, github_agent, auto_pr, slack_agent, slack_auto_post). Submit: "Save flags"

Right column:
Workspace cards. Each card (collapsed): workspace name + workspaceKey chip + status badge + scan count + expand chevron.

Expanded: users list + rollout flags state (5 chips: each flag name + active/disabled badge) + scan count.

---

### Show both pages

1. Primary: `/admin/agencies` with forms + 2 accounts (1 expanded)
2. Secondary: `/admin/startups` variant below (same layout, different forms/data)
