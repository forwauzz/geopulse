# UXIA-001 — Dashboard Shell
> Copy the prompt below into Stitch to generate this screen.

---

## Stitch Prompt

Design a dashboard shell for a SaaS web application called **GeoPulse** — an AI search readiness audit platform. This shell is the persistent layout wrapper for all authenticated user-facing pages at `/dashboard/*`.

### Tech stack context
Next.js 15 App Router, Tailwind CSS, dark/light theme support via semantic tokens. Mobile-responsive (sidebar collapses on mobile). Font: system UI or Inter.

---

### Layout

Two-column layout:
- **Left column:** Fixed sidebar, 256px wide on desktop, full-screen drawer on mobile
- **Right column:** Main content area (flex-1, scrollable)
- **Top header bar:** Spans the full main content area (not the sidebar), sticky at top

---

### Left Sidebar

**Top section:**
- GeoPulse wordmark logo (bold, `text-on-surface` color) with a small location-pin or radar icon
- Below the logo: a **WorkspaceSwitcher** component — a pill-shaped button showing the current workspace context. States:
  - Default/personal: muted pill labeled "Personal workspace"
  - Agency: primary-tinted pill labeled "Agency: [Account Name]". Below it, a horizontal row of client chips: "All clients" chip + one chip per client name. Active chip = filled primary color; inactive = outlined/muted
  - Startup: primary-tinted pill labeled "Startup: [Workspace Name]"

**Primary navigation group — labeled "WORKSPACE" (small caps, muted label):**
- Dashboard (home icon) → `/dashboard`
- **Run a Scan** (plus-circle icon) — highlighted: `bg-primary/10 border border-primary/20 text-primary` rounded pill style, slightly more prominent than other nav items
- Scan History (history/clock icon) → `/dashboard/scans`
- Connectors (plug/link icon) → `/dashboard/connectors` — only shown when integrations are enabled; if shown, display a small green dot badge

**Secondary navigation group — labeled "ACCOUNT" (small caps, muted label):**
- Workspace (settings/gear icon) → `/dashboard/workspace`
- Account (person/manage icon) → `/dashboard/account`
- Blog (article icon) → `/blog`

**Bottom of sidebar:**
- User email (small, muted, truncated)
- Role badge chip (e.g., "founder", "manager", "viewer") — small, outlined
- Sign out button (ghost, small, left-aligned)
- A thin divider line
- "Admin Console →" link (only visible if user is admin) — `text-amber-500`, small, with arrow icon pointing right

**Sidebar footer:** Theme toggle (sun/moon icon) — small, bottom right corner of sidebar

---

### Top Header Bar

Height: 48px, `bg-surface/80 backdrop-blur border-b border-outline-variant`

- **Left:** Breadcrumb text — format: `"Dashboard"` or `"Dashboard / Connectors"` or `"[Workspace Name] / Scans"`. Uses `/` separator. Muted color on parent segments, `text-on-surface` on active segment.
- **Center:** Empty on most pages
- **Right:** Active context pill — shows current workspace context in compact form (e.g., `"Agency: Lifter / Clinic A"` or `"Startup: Acme"` or empty for personal). Then theme toggle icon button.

---

### Design tokens / colors

Use a neutral dark-first design system:
- `bg-background` — main page background (near-black in dark mode, off-white in light)
- `bg-surface` — sidebar background (slightly elevated from background)
- `bg-surface-container` — card/panel backgrounds
- `text-on-surface` — primary text
- `text-on-surface-variant` — secondary/muted text
- `bg-primary` — brand accent (use a medium-bright blue or teal)
- `text-primary` — accent text
- `border-outline-variant` — subtle dividers

---

### Active nav item state

Active nav item: `bg-surface-container text-on-surface font-medium` with a 3px left border in `bg-primary`. All other items: `text-on-surface-variant hover:bg-surface-container/50`.

---

### Mobile behavior

On screens < 768px:
- Sidebar hidden by default, replaced by a hamburger menu button in the top header bar (left side)
- Sidebar opens as a full-height left drawer overlay
- WorkspaceSwitcher and all nav items visible in drawer
- Drawer closes on nav item click or backdrop tap

---

### Show the shell in context

Render this shell with a placeholder main content area that says:
> "Dashboard content loads here"

Show three states side by side (or as tabs in Stitch):
1. **Personal workspace** — no workspace switcher pill shown (just "Personal workspace" label)
2. **Agency workspace** — pill shows "Agency: Lifter", client chips below: "All clients", "Clinic A" (active), "Clinic B"
3. **Startup workspace** — pill shows "Startup: Acme", no client chips

Also show the mobile/drawer state for state #3.
