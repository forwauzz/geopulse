# UXIA-011 — Admin Logs
> /admin/logs — filterable system event log for debugging.

---

## Stitch Prompt

Design the **Admin Logs page** at `/admin/logs` for **GeoPulse**. This is a filterable, paginated system event log for the internal operator. Uses the Admin Console shell from UXIA-008.

---

### Page Header

- **Eyebrow:** "Admin" (small caps, `text-amber-400`)
- **H1:** "System logs"
- **Subtext:** "Filterable structured event log. All platform events are captured here."

---

### Filter Bar

Full-width horizontal bar, `bg-surface-container`, rounded-xl, padding 12px 16px:

Inline controls (left to right):
1. **Level** dropdown (small): "All levels" / "info" / "warn" / "error"
2. **Event type** input (small, placeholder: "scan_completed"): filter by event name
3. **Search** input (small, placeholder: "Search logs..."): free text search
4. **Limit** dropdown (small): "50" / "200" / "500"
5. **Apply filters** button (filled primary, small)

Right side: results summary text — "Showing 50 of 1,432 entries" (small, muted)

---

### Logs Table

Full-width table, `bg-surface-container`, rounded-xl, sticky header:

**Columns:**
- Timestamp (small, muted, fixed width 140px): "Apr 5, 2026 14:32:01"
- Level (fixed width 80px): colored badge pill
  - `info` → `bg-blue-500/20 text-blue-400`
  - `warn` → `bg-amber-500/20 text-amber-400`
  - `error` → `bg-red-500/20 text-red-400`
- Event type (monospace, small, fixed width 200px): "scan_completed"
- Actor (small, muted, fixed width 120px): truncated user ID "4a2f8c..." or "system"
- Payload summary (flex, remaining width): key:value inline chips in muted monospace
- Expand (icon button, 32px): chevron-down to expand row

**Row hover state:** slightly lighter background

**Expanded row (inline drawer, below the row):**
Full JSON payload in a `<pre>` block with monospace font, `bg-surface-container-low` background, rounded, padding 12px. Syntax-highlighted or plain — either works.

**Show 8 log rows with varied levels:**

| Time | Level | Event | Actor | Payload |
|---|---|---|---|---|
| 14:32:01 | info | scan_completed | 4a2f8c | scanId: abc123, score: 74, domain: acme.com |
| 14:28:44 | info | checkout_started | 9c1d2e | scanId: def456, amount: 2900 |
| 14:15:22 | warn | slack_delivery_failed | 7b3e1f | installationId: sl_123, error: channel_not_found |
| 14:02:55 | info | startup_scan_queued | system | workspaceId: acme-health, scanId: ghi789 |
| 13:47:11 | error | github_install_error | 2a1c9d | installationId: gh_456, message: unauthorized |
| 13:30:00 | info | payment_completed | 5e8f4a | paymentId: pi_xyz, amount: 2900 |
| 13:12:38 | info | lead_submitted | anon | email: hash, source: homepage |
| 12:58:02 | warn | rate_limit_hit | anon | ip: 192.168.x.x, endpoint: /api/scan |

Show row 3 (slack_delivery_failed) in the expanded state with full JSON visible.

---

### Empty state (no logs match filter)

When filters return no results:
- Centered in the table area
- Icon: magnifying glass (muted)
- Text: "No log entries match the current filters."
- Sub-text: "Try adjusting the level filter or clearing the search."
- "Clear filters" button (ghost)

---

### Pagination / load-more

Below the table:
- "Load more" button (ghost, centered) — or a simple "Page 1 of 29" + prev/next buttons

Use "Load more" style (simpler UX for operator tools).
