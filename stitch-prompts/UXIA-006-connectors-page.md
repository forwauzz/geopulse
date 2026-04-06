# UXIA-006 — Connectors Page
> This is one of the most important new pages. It centralizes GitHub + Slack from their current buried-in-tabs location.

---

## Stitch Prompt

Design the **Connectors page** at `/dashboard/connectors` for **GeoPulse**. This page centralizes all workspace integrations into a single place. Currently integrations are buried across 2 different tabs of a separate dashboard — this page replaces all of that with one clean surface.

This page is only shown when the admin has enabled integrations for the workspace.

---

### Page Header (main content area)

- **Breadcrumb:** "Dashboard / Connectors"
- **H1:** "Connectors"
- **Subtext:** "Manage integrations that power automated audits and delivery."

---

### Status Message Banner (shown when OAuth return param is present)

A full-width dismissable banner at the top of content (below page header):

**Success variant** (`bg-green-500/15 border border-green-500/30 text-green-400`):
- Icon: checkmark-circle
- Text: "GitHub connected successfully. Your repositories are now available for PR automation."
- Dismiss "×" button top-right

**Error variant** (`bg-red-500/15 border border-red-500/30 text-red-400`):
- Icon: x-circle
- Text: "Slack connection failed. Please try again or check your Slack app permissions."

Show both variants in the design.

---

### GitHub Connector Card

Full-width card (`bg-surface-container`, rounded-2xl, padding 24px). Sections separated by thin dividers.

**Card header row:**
- Left: GitHub icon (octocat or simple GitHub mark, 32px) + title "GitHub" (H3, bold) + subtitle "Automate PR creation from audit recommendations"
- Right: Status badge chip
  - "Connected" → `bg-green-500/20 text-green-400` chip with dot
  - "Not connected" → `bg-surface-container-high text-on-surface-variant` chip

**Section 1 — Connection (when connected):**
- Label: "Installation" (small caps, muted)
- Row: "Installation ID: 12847302" · "Account: acme-health" · "Type: Organization"
- Action buttons (inline): "Reconnect GitHub" (ghost, small) · "Disconnect" (ghost, destructive-red, small)

**Section 1 — Connection (when not connected):**
- Muted description: "Connect your GitHub account to allow GeoPulse to open pull requests for your approved recommendations."
- CTA button: "Connect GitHub" (filled primary)

**Section 2 — Repository Allowlist (only shown when connected):**
- Label: "Repository allowlist" (small caps, muted)
- Description (small, muted): "Only repositories in this list can receive automated PRs. One per line: owner/repo"
- Textarea (monospace font, 5 lines, rounded-xl): placeholder "acme-health/website\nacme-health/blog"
- Below textarea: current repos as chips: "acme-health/website" (green dot) · "acme-health/docs" (green dot)
- Save button: "Save allowlist" (ghost, small, right-aligned)

---

### Slack Connector Card

Full-width card (`bg-surface-container`, rounded-2xl, padding 24px). Same structure as GitHub card.

**Card header row:**
- Left: Slack hashbang icon (32px) + "Slack" (H3) + "Receive audit delivery notifications"
- Right: Status badge — "Connected" or "Not connected"

**Section 1 — Connected workspaces:**
- Label: "Connected workspaces" (small caps, muted)
- Table-style list (each row, light divider between):
  - Workspace name: "Acme Health Slack" (bold)
  - Team ID: "T04XK..." (small, monospace, muted)
  - Domain: "acme.slack.com" (small, muted)
  - Status badge: "active" (green)
  - "Disconnect" link (small, destructive)
- "Add workspace" button (ghost, small, `+` icon) — or "Connect Slack" if no workspaces

**Section 2 — Destination channels:**
- Label: "Destination channels" (small caps, muted)
- List of destinations:
  - Row: channel name "#ai-audit-results" + "Default" badge chip (if isDefault) + status chip + "Remove" link
  - Row: channel "#dev-team" + status chip + "Remove" link
- "Add destination" disclosure (toggle):
  - Installation selector (dropdown)
  - Channel ID input
  - Channel name input (optional)
  - "Set as default" checkbox
  - "Save destination" button

**Section 3 — Auto-post (only if user has permission):**
- Label: "Auto-post" (small caps, muted)
- Toggle: "Automatically post new audit results to the default destination"
  - Toggle switch (styled pill, ON state = primary color)
  - "Save" button (small, ghost) — appears when toggle state changes

**Section 4 — Push to Slack:**
- Label: "Send a report" (small caps, muted)
- Description: "Manually push any completed report to a Slack channel."
- Form inline:
  - Report selector (dropdown): "Acme Health — Apr 3, 2026 (score: 68)"
  - Destination selector (dropdown): "#ai-audit-results"
  - Event type selector: "New audit ready" | "Plan ready"
  - "Push to Slack" button (filled primary, small)

**Section 5 — Recent delivery attempts:**
- Label: "Recent deliveries" (small caps, muted)
- List of 3 rows:
  - Status badge (sent/failed) + event type + channel + date + error message (if failed)
  - Row 1: [sent] "new_audit_ready" → #ai-audit-results — Apr 3, 2026
  - Row 2: [sent] "plan_ready" → #ai-audit-results — Mar 28, 2026
  - Row 3: [failed] "new_audit_ready" → #dev-team — Mar 20, 2026 — "channel_not_found"

---

### Future Connector Placeholders (2 muted cards, non-interactive)

Two cards side by side (or stacked on mobile), `bg-surface-container opacity-60`:

Each card:
- Logo icon (32px, grayscale)
- Title: "LinkedIn" / "Twitter / X"
- Subtitle: "Coming soon"
- "Coming soon" badge chip (muted)
- No buttons

---

### Gated state (when connectors are disabled for workspace)

Replace all connector cards with a single centered empty state:
- Icon: plug/link (large, `text-on-surface-variant/40`)
- Title: "Connectors not available"
- Body: "Integrations haven't been enabled for your workspace yet. Contact your administrator to enable GitHub and Slack."
- No action buttons

---

### Show three states

1. **Primary:** GitHub connected + Slack connected — all sections visible, success banner at top
2. **Secondary:** Neither connected — "Not connected" state on both cards
3. **Gated:** Connectors disabled — empty state only
