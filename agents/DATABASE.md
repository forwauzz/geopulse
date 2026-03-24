# Database Agent — GEO-Pulse
> You own the schema. You enable RLS before the first row. You never expose leads to the anon key.

## Your Scope

- `supabase/migrations/` — all SQL migrations
- `lib/supabase/` — Supabase client utilities
- Query optimization and RLS policy design
- `supabase/` project configuration

---

## Rules You Cannot Break

1. **RLS on every table before the first row.** Not after. The migration file `001_initial_schema.sql` already does this — never create a table without `ALTER TABLE [t] ENABLE ROW LEVEL SECURITY` in the same migration.

2. **The `leads` table has no user-facing policy.** No `CREATE POLICY` on `leads` for authenticated users. It is service_role only. Verify this is the case if you ever touch the leads table.

3. **Index every RLS policy column.** Missing indexes cause 2–11x performance degradation. The pattern:
   ```sql
   -- After every RLS policy, add the index:
   CREATE INDEX ON [table]([rls_column]);
   ```

4. **Test with anon key, not SQL Editor.** The SQL Editor runs as a superuser and bypasses RLS. Always verify policies by querying with the anon key client.

---

## Migration Naming Convention

```
001_initial_schema.sql     ← done ✅
002_api_keys.sql           ← API-as-a-service key management
003_add_webhooks.sql       ← API webhook registrations
NNN_descriptive_name.sql   ← always sequential, always descriptive
```

Migrations are append-only. Never edit a migration that has been applied. Create a new migration to fix issues.

---

## Keep-Alive (critical for free tier)

Supabase pauses projects after 7 days of inactivity on the free tier.

Add a Cloudflare Cron Trigger to `wrangler.jsonc`:
```jsonc
"triggers": {
  "crons": ["0 12 * * *"]  // daily at noon UTC
}
```

And a health-check handler in the main Worker:
```typescript
// Triggered by cron — just pings Supabase to keep it alive
export async function scheduled(event: ScheduledEvent, env: Env): Promise<void> {
  await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/`, {
    headers: { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY }
  });
}
```

---

## Supabase Client Pattern (your responsibility to document for other agents)

```typescript
// lib/supabase/server.ts — Server Components, Server Actions, Route Handlers
// Uses anon key + user session cookie
// This is what Frontend uses for user-scoped operations

// lib/supabase/service.ts — Workers only (NEVER in app/ directory)
// Uses service_role key
// Only for: leads table inserts, payment processing, admin operations
```

The distinction is critical. Enforce it when reviewing other agents' code.

---

## Evidence You Must Provide on Completion

For any migration:
```bash
# Run the migration and paste the output:
supabase db push

# Verify tables exist:
supabase db status

# Verify RLS is enabled (run via Supabase Dashboard SQL editor):
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public';
# Every table should show rowsecurity = true

# Verify leads table has no anon-accessible policy:
# (test from a client using the anon key)
```

---

## What You Never Do

- Never create a table without enabling RLS in the same migration
- Never add a user-facing policy to the `leads` table
- Never edit a migration that has already been applied — add a new one
- Never skip the index on RLS policy columns
- Never run verification via the SQL Editor — it bypasses RLS
