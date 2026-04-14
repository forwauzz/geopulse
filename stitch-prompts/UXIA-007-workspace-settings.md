# UXIA-007 — Workspace Settings Page
> Replaces the startup "Settings tab" metadata section. Clean single-purpose page.

---

## Stitch Prompt

Design the **Workspace Settings page** at `/dashboard/workspace` for **GeoPulse**. This page shows a user their current workspace metadata, their role, and the service capabilities available to them. It is read-mostly — users can see their configuration but most changes are made by admins.

---

### Page Header

- **Breadcrumb:** "Dashboard / Workspace"
- **H1:** "Workspace"
- **Subtext:** "Your workspace configuration and service availability."

---

### Section 1 — Workspace Info

Card (`bg-surface-container`, rounded-2xl, padding 24px):
- Label: "WORKSPACE INFO" (small caps, muted)

Info grid (2 columns on desktop, 1 column on mobile):
- **Name:** "Acme Health" (bold)
- **Workspace key:** `acme-health` (monospace chip, `bg-surface-container-high`)
- **Canonical domain:** "acmehealth.com"
- **Your role:** "founder" (badge chip, `bg-primary/15 text-primary`)
- **Bundle:** "startup-pilot" (monospace chip, muted)
- **Status:** "active" (green badge)
- **Billing mode:** "paid" (badge)

---

### Section 2 — Service Availability

Card (`bg-surface-container`, rounded-2xl, padding 24px):
- Label: "SERVICE AVAILABILITY" (small caps, muted)
- Description (small, muted): "These services are configured by your administrator. Contact support to request changes."

Table of services (each row: service name + description + status):

| Service | Description | Status |
|---|---|---|
| GitHub Integration | PR automation from recommendations | ✅ Enabled (green) |
| Slack Integration | Audit delivery notifications | ✅ Enabled (green) |
| Slack Auto-Post | Automatic posting on new audits | ✅ Enabled (green) |
| Scan Launch | Run AI readiness scans | ✅ Enabled (green) |
| Deep Audit | Full report generation | ✅ Enabled (green) |
| Report History | Access past audit reports | ✅ Enabled (green) |

Status display: "✅ Enabled" = `text-green-400` with dot; "🚫 Disabled" = `text-on-surface-variant` with x mark; "⏳ Blocked (billing)" = `text-amber-400`

---

### Section 3 — Rollout Features

Card (`bg-surface-container`, rounded-2xl, padding 24px):
- Label: "FEATURE FLAGS" (small caps, muted)
- Description: "Active features in your workspace."

Compact feature list (each item: feature key + status chip):
- `startup_dashboard` → "Active" (green chip)
- `github_agent` → "Active" (green chip)
- `auto_pr` → "Active" (green chip)
- `slack_agent` → "Active" (green chip)
- `slack_auto_post` → "Active" (green chip)

Show a second variant where some flags are off:
- `startup_dashboard` → "Active"
- `github_agent` → "Disabled" (muted chip)
- `auto_pr` → "Disabled" (muted chip)
- `slack_agent` → "Active"
- `slack_auto_post` → "Disabled"

---

### Section 4 — Workspace Members (read-only)

Card (`bg-surface-container`, rounded-2xl, padding 24px):
- Label: "MEMBERS" (small caps, muted)
- Description: "Members are managed by your administrator."

User list — 3 rows:
| Name/Email | Role | Status |
|---|---|---|
| uzziel@acme.com | founder | active (green) |
| faical@acme.com | admin | active (green) |
| hugo@acme.com | member | invited (amber) |

---

### Bottom CTA

A muted callout at the very bottom:
- Text: "Need to change your workspace name, domain, or billing? "
- Link: "Contact your administrator"

---

### Show one state (connected startup with all services active)

Use the dashboard shell from UXIA-001 in Startup workspace mode.
