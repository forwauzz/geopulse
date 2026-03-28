create table if not exists public.app_logs (
  id uuid primary key default gen_random_uuid(),
  level text not null check (level in ('info', 'warning', 'error')),
  event text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists app_logs_created_at_idx
  on public.app_logs (created_at desc);

create index if not exists app_logs_event_idx
  on public.app_logs (event);

create index if not exists app_logs_level_idx
  on public.app_logs (level);

alter table public.app_logs enable row level security;

comment on table public.app_logs is
  'Internal structured application logs for admin observability. Service-role writes and reads only.';
