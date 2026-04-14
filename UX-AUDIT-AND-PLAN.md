# GeoPulse UX Audit + Enhancement Plan
**Scope:** Startup flows, agency workspaces, login, dashboard shell  
**Goal:** Make the product feel intuitive, powerful, and effortless — like using Claude

---

## The Core Diagnosis

GeoPulse has good visual bones — the token system is consistent, the color palette is disciplined, the typography works. But the **structural experience breaks down** at almost every decision point. Users are left to figure out what to do next, where they are, and who they're supposed to be.

Three root problems:

1. **No clear mental model is established** — the product has three user types (startup, agency, personal) but no onboarding moment that says "here's what this is for you."
2. **Navigation layers compete instead of cooperate** — on the startup dashboard alone there are three separate navigation systems fighting for attention.
3. **Internal product language leaks into user-facing UI** — technical labels, raw UUIDs, admin-speak, and Supabase references appear on screens real users see.

---

## Audit: Screen by Screen

---

### 1. Login / Sign-Up Flow

**What exists:**
- Sign-in page shows two forms side-by-side: "Password sign-in" and "Magic link"
- Sign-up page conditionally renders fields based on `bundleKey` (agency vs. startup vs. personal)
- No welcome context, no value prop, no "what is this" moment

**Problems:**

**A — Internal language exposed to users**
> "Use this for agency or pilot accounts that have a Supabase password"  
> "Use this for normal customer recovery and existing report access."

These are developer comments. Real users see them and lose trust immediately.

**B — Two equal-weight auth methods confuses users**  
Password and magic link are presented as two equal options with no visual hierarchy. Users stall. The default should be obvious: magic link for new/returning customers, password available but secondary.

**C — Sign-up form has no warmth or context**  
The sign-up page opens directly into a form with no explanation of what the user signed up for, what they're setting up, or what happens next. There's no "Welcome to GeoPulse" moment.

**D — Conditional fields appear without transition**  
The `bundleKey` logic shows/hides fields like "Agency name" or "Website URL" but there's no visual guidance about why those fields matter or what they're used for.

**E — No post-auth orientation**  
After sign-in, users are redirected to `/dashboard` with no context about what they're seeing or what to do first.

---

### 2. Dashboard Sidebar

**What exists:**  
Left sidebar with: Dashboard, Run a Scan (highlighted), Connectors, Billing, Settings, Blog — then user email + sign out at bottom.

**Problems:**

**A — Blog has no place in product navigation**  
The Blog link sits between Billing and Settings in the workspace nav. This trains users to leave the product and creates brand confusion between marketing and product.

**B — Flat navigation gives no hierarchy**  
All nav items read as equal priority. "Run a Scan" has a highlight treatment (intent: good), but it's using a border+background approach that competes with the active state, making it look like two things are selected.

**C — "Settings" goes to workspace metadata — not settings**  
Users expect Settings to contain preferences, notifications, and account controls. Instead they land on a read-only workspace info page that tells them to "contact GEO-Pulse admin."

**D — Collapsed icon-only state loses context**  
In the icon-only collapsed state, "Dashboard" and "Settings" become a grid icon and a gear icon — indistinguishable from any other SaaS tool. No visual anchor for the product identity.

**E — No section groupings for complex accounts**  
Agency users who manage clients have no navigation structure to reflect that. Everything is in a single flat "Workspace" section.

---

### 3. Main Dashboard Page (`/dashboard`)

**What exists:**  
The primary dashboard is a large catch-all page that shows different content depending on account type: personal scan hero, agency section (client tabs + scan history), startup section — sometimes all three on the same page.

**Problems:**

**A — One page tries to serve three different users**  
A startup founder, an agency manager, and a personal user land on the same `/dashboard` URL and see different but unlabeled sections. There's no entry-point personalization.

**B — Context switching via hidden URL params**  
Agency context is carried as `?agencyAccount=xxx&agencyClient=yyy`. Users can't tell they're "inside" a specific client workspace. There's no persistent breadcrumb or header showing "You're viewing: Lifter / Clinic A."

**C — Scan history table format is functional but cold**  
The scan table (domain, score, grade, date) shows data without meaning. A score of 62 on its own tells a founder nothing about what changed or what to do. The grade color works but needs a trend indicator alongside it.

**D — Empty state for no scans is blank**  
First-time users with no scans see no real guidance on what to do. The "Run a Scan" button in the nav is the only affordance.

---

### 4. Startup Dashboard (`/dashboard/startup`)

**What exists:**  
The startup dashboard (`StartupDashboardPageShell`) is a large card containing: workspace switcher, a "Start here" flow strip (4 section cards), a "Current section" label, a `StartupTabBar`, stat strip, and then the actual tab content.

**Problems:**

**A — Three navigation systems on one page**  
1. Workspace switcher (pills at top — which workspace are you in?)
2. StartupFlowStrip (4 cards: Overview, Audits, Delivery, Settings)
3. StartupTabBar (tabs: the same 4 sections)

These are doing the same job in three different ways. Users don't know which one to use. The StartupFlowStrip and StartupTabBar are redundant.

**B — "Start here" guide signals the dashboard is hard to understand**  
If users need an in-page guide to navigate the dashboard, the dashboard is too complex. This is a symptom, not a solution.

**C — "Current section" box is pure redundancy**  
The box that says "Current section: Overview first / Start with score, trend…" adds nothing. The selected tab already communicates what section the user is in. This is visual clutter.

**D — Stat strip gives 4 equal-weight numbers**  
Scans / Average score / Recommendations / Open recommendations — all rendered identically. But these have very different importance. "Open recommendations" is the actionable metric. It should be visually dominant. "Number of scans" is the least important stat on this screen.

**E — 2-column tab content layout is structurally wrong**  
`grid gap-4 lg:grid-cols-2` applies a 2-column layout to ALL tab content. This makes sense for some data (overview) but looks broken for others (settings, delivery). The layout shouldn't be hardcoded at the shell level.

**F — Startup Dashboard is a card nested inside a page**  
The large `rounded-3xl border bg-surface-container-low p-6 shadow-float` wrapper around the entire startup dashboard creates a "card within a page" structure. This adds visual weight without adding hierarchy. The page already has the sidebar. The content doesn't need a second container.

---

### 5. Agency Workspace (User-facing, `/dashboard`)

**What exists:**  
Agency users see a section in the main dashboard that includes a client tab switcher, scan history per client, and the `AgencyClientManagementView` (forms to add clients and tracked domains).

**Problems:**

**A — Admin-level forms are the primary UI for agency users**  
The "Add client" and "Add tracked domain" forms (from `AgencyClientManagementView`) are embedded directly in the main agency dashboard. Most agency users are there to review scans and manage work — not provision new clients. These forms dominate the screen.

**B — Client switching uses tab pills but without label**  
The client switcher shows pills at the top with no label like "Viewing client:" or "Switch client." New users don't know these are selectable or what selecting them does.

**C — No clear starting action for an agency user**  
The agency section has: client switcher, stat cards, scan table, management forms — with no visual signal for what to do first. "Run a scan for this client" should be the primary CTA, not buried below form sections.

**D — The "Clients" count stat shows agency metadata, not value**  
A stat card showing "Clients: 3" tells an agency manager nothing useful. The most meaningful stat for them is: which client has the lowest score? Which has the most open recommendations? 

---

### 6. Workspace / Settings Page (`/dashboard/workspace`)

**What exists:**  
A read-only metadata page showing: email, user ID (raw UUID), account type, workspace key, canonical domain, role, status. With a note: "Contact GEO-Pulse admin to make changes."

**Problems:**

**A — Dead-end page with no actions**  
"Settings" implies control. This page gives users none. It's a dead end that makes the product feel locked.

**B — Raw UUIDs and internal keys visible to users**  
`User ID: 8f3b2...` and `Workspace key: geo-startup-xyz` are internal identifiers. Regular users have no use for them and they erode trust/professionalism.

**C — Account type label shows internal logic**  
"Account type: Agency + Startup" is an internal classification, not a user-facing label. Users should see what they have access to, not how the backend categorizes them.

**D — "Contact GEO-Pulse admin to make changes" — friction without resolution**  
There's no link to contact the admin, no email address, no next step. It's a wall.

---

## Enhancement Plan: Priority Order

---

### Priority 1 — Fix the Login/Auth Flow

This is the first thing every user sees. It sets the tone for the entire product.

**Changes:**

1. **Collapse to a single auth method by default: magic link.**  
   - Magic link is the primary, cleanest path. Show it full-width.
   - Add a "Have a password? Sign in with password" text link below — collapsed by default.
   - Remove all internal labels from both forms.

2. **Add a brief context header above the form:**
   ```
   [GeoPulse wordmark]
   
   Sign in to your workspace
   Get your AI search visibility score and track what's improving.
   ```

3. **Sign-up: Lead with the outcome, not the form.**  
   Instead of opening a form immediately:
   - Show what they're setting up: "You're creating a [Startup / Agency] workspace for [domain/org]."
   - Then collect fields in logical groups: who you are → what you're tracking → credentials.

4. **Post-sign-in: Route users to the right place with context.**
   - Startup users → `/dashboard?onboarded=1` with a one-time welcome banner showing their workspace name and a single CTA: "Run your first scan."
   - Agency users → `/dashboard` with their first agency account pre-selected, and a context banner showing "You're managing [Agency Name]."

---

### Priority 2 — Simplify the Startup Dashboard Navigation

Remove two of three navigation systems. Keep one.

**Changes:**

1. **Remove `StartupFlowStrip` entirely.** It's a symptom of a confusing layout, not a solution. Fix the layout instead.

2. **Remove the "Current section" label box.** The tab bar communicates this already.

3. **Keep only `StartupTabBar` as the navigation** — but improve it:
   - Make it cleaner: simple underline tabs, no backgrounds.
   - Add a one-line description under the active tab title (like the StartupFlowStrip currently does) — but inline within the content area, not as a separate box.

4. **Redesign the stat strip with clear hierarchy:**
   - Primary stat (large, prominent): **GEO Score** with trend arrow (↑ +4 from last scan)
   - Secondary stats (smaller): Open recommendations · Scans run
   - Remove "Total recommendations" — it's a vanity metric.

5. **Remove the outer card wrapper** from the startup dashboard. The page already has structure via the shell. The content should breathe.

---

### Priority 3 — Fix the Sidebar Navigation

**Changes:**

1. **Remove Blog from workspace navigation.** It belongs in the footer or a help/resources section, not the core product nav.

2. **Rename "Settings" → "Account"** and actually build it out (see Priority 4).

3. **Fix the "Run a Scan" highlight:**
   - Use a filled button style (like a call-to-action) instead of the border+bg tint.
   - Or: move it out of the nav list entirely and make it a persistent action button at the bottom of the sidebar above the user section.

4. **Add a context indicator for multi-account users:**  
   If a user has agency accounts, show the currently active context in the sidebar — like a small label: "Viewing: Lifter / Clinic A" — so they always know where they are.

5. **Group nav items logically:**
   ```
   [Workspace]
     Dashboard
     Run a Scan  ← primary CTA
     Content
   
   [Account]
     Connectors
     Billing
     Account
   ```

---

### Priority 4 — Make the Settings/Account Page Useful

**Changes:**

1. **Rename to "Account"** — and make it contain real controls:
   - Notification preferences (email / Slack alerts)
   - Connectors shortcut
   - Workspace name (editable by owner)
   - Billing shortcut

2. **Hide all internal/technical data from the main view:**
   - Remove raw UUID from the main view entirely.
   - If workspace key is needed for debugging, put it in a collapsed "Advanced" section with a copy button.

3. **Replace "Contact admin" wall with a real action:**
   - If the user can't edit, show: "To update workspace settings, email [admin contact] or [send a request button]."

---

### Priority 5 — Establish Persistent Context for Agency Users

**Changes:**

1. **Add a persistent "You are viewing:" context strip** at the top of agency pages — showing: Agency Name → Client Name (with a one-click switcher).

2. **Move admin-level forms (Add client, Add tracked domain) out of the primary dashboard** into a dedicated "Manage" sub-page or modal. The primary agency dashboard should be the client overview and scan performance.

3. **Redesign the agency primary view around client health:**
   ```
   [Agency Name] — 4 clients
   
   Client         Last scan    Score    Open recs    Action
   Clinic A       3 days ago   71       5            Run scan →
   Clinic B       12 days ago  44 ▼     11           Run scan →
   Clinic C       —            —        —            First scan →
   ```
   This is the view an agency manager actually needs.

4. **Single primary CTA per client row: "Run scan →"**  
   Not buried in a separate page — visible inline so action is one click away.

---

### Priority 6 — Empty States and First-Run Experience

Every empty state should answer: what's missing, why it matters, and what to do.

**Replace:**
> "No workspace membership found. Your account is on the personal plan."

**With:**
> "You're on the free plan. Run your first scan to see how you show up in AI search results."  
> [Run a free scan →]

**For new agency accounts with no clients:**
> "No clients yet. Add your first client to start tracking their AI visibility."  
> [Add a client →]

**For startup users with no scans:**
> "Your workspace is ready. Run a scan to get your first GEO score."  
> [Run your first scan →]

---

### Priority 7 — Language Cleanup (Throughout)

A full audit of copy is needed. The highest-impact changes:

| Current (wrong) | Replace with |
|---|---|
| "Use this for agency or pilot accounts that have a Supabase password" | Remove. Just label it "Sign in with password." |
| "Use this for normal customer recovery and existing report access" | Remove. Just label it "Sign in with a link — no password needed." |
| "Your startup context" (as an eyebrow label) | Remove or replace with the workspace name |
| "Action-only tracking for founder and team implementation workflow" | "Track your progress and act on what's next." |
| "Read-only metadata for your active workspace" | "Your workspace details" |
| "Contact GEO-Pulse admin to make changes" | "Need to update this? [Contact support →]" |
| "Workspace key: geo-startup-xyz" | Hidden or copy-only in advanced section |
| "User ID: 8f3b2..." | Hidden entirely from user-facing pages |
| "Startup context" (eyebrow on scan page) | "Scanning for: [Workspace Name]" |

---

## The "Claude Feel" Checklist

What makes Claude feel effortless, applied to GeoPulse:

| Principle | Current state | Target state |
|---|---|---|
| **Instant clarity** — you always know what to do next | Startup dashboard has 3 nav systems, no dominant CTA | Single primary action visible at all times |
| **No internal language** — you never see the machinery | Supabase references, UUIDs, flag keys visible to users | All internal labels removed from user-facing surfaces |
| **Smart defaults** — the right thing is pre-selected | Agency clients must be manually selected every visit | Last active client remembered and pre-selected |
| **Progressive disclosure** — complexity only when needed | Admin forms live in the main dashboard | Admin-level actions moved to dedicated manage flows |
| **Calm confidence** — never anxious or uncertain | "Contact admin to make changes" — dead end | Every screen has a clear next action or link |
| **Single voice** — consistent, human language | Mix of developer notes, marketing copy, and technical labels | Consistent tone: direct, warm, outcome-focused |

---

## Implementation Sequence

**Week 1 (Foundation)**
- [ ] Login/auth flow redesign (Priority 1)
- [ ] Sidebar nav cleanup — remove Blog, rename Settings, fix highlight (Priority 3)

**Week 2 (Startup Flow)**
- [ ] Remove StartupFlowStrip and "Current section" box (Priority 2)
- [ ] Redesign stat strip with GEO Score as primary metric (Priority 2)
- [ ] Remove outer card wrapper from startup dashboard (Priority 2)

**Week 3 (Agency Workspace)**
- [ ] Add persistent context strip for agency users (Priority 5)
- [ ] Move Add Client/Add Domain forms to manage sub-page (Priority 5)
- [ ] Redesign agency client table as primary view (Priority 5)

**Week 4 (Polish)**
- [ ] Rebuild Settings/Account page with real controls (Priority 4)
- [ ] Write all new empty states (Priority 6)
- [ ] Full language audit and copy replacement (Priority 7)

---

*Audit by Claude / April 2026*
