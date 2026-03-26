## GEO-Pulse — Weekly Marketing Attribution Report (v1)

This report is designed for Phase 2 decision-making: **first-touch + last-touch** only, with minimal infrastructure.

### Prereqs

- **Migrations applied**: `007_marketing_attribution.sql`, `008_marketing_attribution_views.sql`
- Events flowing into `analytics.marketing_events` (scan → lead → checkout → payment)

### 1) Sanity check: are events flowing?

Run:

```sql
select event_name, event_ts, anonymous_id, scan_id, utm_source, utm_campaign
from analytics.marketing_events
order by event_ts desc
limit 50;
```

You should see at least: `scan_started`, `scan_completed`, `lead_submitted`, `checkout_started`, `payment_completed` (when applicable).

### 2) Weekly funnel table (channel + campaign)

Run:

```sql
select *
from analytics.channel_funnel_weekly_v1
order by week_start desc, payments_completed desc
limit 200;
```

### 3) Campaign leaderboard (paid conversions)

Run:

```sql
select
  date_trunc('week', payment_ts)::date as week_start,
  coalesce(last_touch_channel, 'direct_or_unknown') as channel,
  last_touch_utm_source as utm_source,
  last_touch_utm_campaign as utm_campaign,
  count(*) as paid_conversions
from analytics.attribution_conversions_v1
group by 1,2,3,4
order by week_start desc, paid_conversions desc;
```

### 4) Content conversion table (if `content_id` is used)

Run:

```sql
select
  date_trunc('week', payment_ts)::date as week_start,
  last_touch_channel as channel,
  last_touch_content_id as content_id,
  count(*) as paid_conversions
from analytics.attribution_conversions_v1
where last_touch_content_id is not null
group by 1,2,3
order by week_start desc, paid_conversions desc;
```

### 5) Time-to-conversion distribution (first-touch → pay)

Run:

```sql
select
  date_trunc('week', payment_ts)::date as week_start,
  percentile_cont(0.5) within group (order by seconds_to_convert_from_first_touch) as p50_seconds,
  percentile_cont(0.9) within group (order by seconds_to_convert_from_first_touch) as p90_seconds,
  percentile_cont(0.99) within group (order by seconds_to_convert_from_first_touch) as p99_seconds
from analytics.attribution_conversions_v1
where seconds_to_convert_from_first_touch is not null
group by 1
order by week_start desc;
```

### Notes / guardrails

- No raw email is stored in `analytics.*` — **email joins use `email_hash` only**.
- Attribution windows are fixed in v1:
  - **First-touch**: 30 days
  - **Last-touch**: 7 days

