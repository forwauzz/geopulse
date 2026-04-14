# UXIA-010 — Admin Service Control
> /admin/services — the control plane for what each workspace can access.

---

## Stitch Prompt

Design the **Admin Service Control page** at `/admin/services` for **GeoPulse**. This is where the internal operator configures what capabilities are available to which customers. Uses the Admin Console shell from UXIA-008.

---

### Page Header

- **Eyebrow:** "Admin" (small caps, `text-amber-400`)
- **H1:** "Service control"
- **Subtext:** "Manage the service catalog, bundle entitlements, and per-workspace overrides."

---

### Stats row — 4 cards

1. **SERVICES** — 8
2. **BUNDLES** — 5
3. **BUNDLE MAPPINGS** — 24
4. **OVERRIDES** — 3

---

### Layout

Single column, stacked sections with generous spacing between them.

---

### Section 1 — Service Catalog Table

Label: "SERVICE CATALOG" (H3)

Full-width table, `bg-surface-container`, rounded-xl:

Columns: Service key | Default enabled | Default gating | Actions

| Service key | Default enabled | Default gating | Actions |
|---|---|---|---|
| github_integration | false | billing | Edit |
| slack_integration | false | billing | Edit |
| slack_notifications | false | billing | Edit |
| scan_launch | true | none | Edit |
| report_history | true | none | Edit |
| deep_audit | false | billing | Edit |
| startup_dashboard | false | rollout | Edit |

Status badges:
- Default enabled: "Yes" (green) / "No" (muted)
- Default gating: "none" (muted) / "billing" (amber) / "rollout" (blue)

Below the table: collapsed "Add service" form (disclosure toggle)

---

### Section 2 — Bundle Configuration

Label: "BUNDLES" (H3)

Cards in a 2-column grid, each bundle as a card:

**Bundle card** (`bg-surface-container`, rounded-xl, padding 16px):
- Bundle key (bold monospace): "startup-pilot"
- Service list (each as a chip row):
  - "github_integration: ON" (`bg-green-500/20 text-green-400`)
  - "slack_integration: ON" (green)
  - "slack_notifications: ON" (green)
  - "deep_audit: OFF" (`bg-surface-container-high text-on-surface-variant`)
  - "report_history: ON" (green)
- "Edit bundle" link (small, bottom of card)

Show 3 bundle cards:
1. "startup-pilot" — github ON, slack ON, slack_notifications ON, deep_audit OFF, report_history ON
2. "agency-pilot" — github OFF, slack OFF, deep_audit ON, report_history ON, scan_launch ON
3. "free" — github OFF, slack OFF, deep_audit OFF, report_history OFF, scan_launch ON

Below the grid: collapsed "Add bundle mapping" form

---

### Section 3 — Entitlement Overrides

Label: "ENTITLEMENT OVERRIDES" (H3)

Full-width table, `bg-surface-container`, rounded-xl:

Columns: Scope type | Scope ID | Service key | Enabled | Reason | Timestamp

| Scope | ID | Service | Enabled | Reason | Date |
|---|---|---|---|---|---|
| workspace | acme-health | deep_audit | ✅ Yes | "Pilot extension" | Apr 3, 2026 |
| agency | lifter-agency | slack_integration | ✅ Yes | "Beta test" | Mar 28, 2026 |
| workspace | beta-corp | github_integration | 🚫 No | "Suspended" | Mar 15, 2026 |

Below: collapsed "Add override" form

---

### Collapsed forms (show one open as example)

"Add entitlement override" form (open):
- Scope type (dropdown): workspace / agency
- Scope ID (input): placeholder "acme-health"
- Service key (dropdown of all services)
- Enabled (dropdown): true / false
- Reason (input): placeholder "Why is this override needed?"
- Submit: "Save override"
