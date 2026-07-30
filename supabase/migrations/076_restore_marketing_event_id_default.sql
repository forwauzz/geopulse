-- Production inherited a legacy analytics.marketing_events.id column without
-- the UUID default declared by the current schema. Attribution inserts provide
-- event_id for idempotency but intentionally rely on id's database default.

ALTER TABLE analytics.marketing_events
  ALTER COLUMN id SET DEFAULT gen_random_uuid();
