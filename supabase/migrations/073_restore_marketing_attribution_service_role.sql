-- Restore the documented service-role-only attribution contract.
--
-- The analytics schema and marketing_events table intentionally have no
-- anon/authenticated policies. RLS bypass alone is insufficient when the
-- service_role has not also been granted schema/table privileges, which made
-- production event inserts fail with "permission denied for table
-- marketing_events".

REVOKE ALL ON SCHEMA analytics FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA analytics FROM anon, authenticated;

GRANT USAGE ON SCHEMA analytics TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA analytics TO service_role;
GRANT INSERT ON TABLE analytics.marketing_events TO service_role;
