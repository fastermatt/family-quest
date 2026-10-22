-- Windows companion stage 1.5: hourly usage summaries. NOT APPLIED.
-- One small row per PC per upload (about 24 a day), 14-day retention enforced on each upload.
-- No per-lookup rows, no scheduled job.

alter table public.companion_devices add column if not exists last_usage_at timestamptz;

create table if not exists public.companion_usage (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references companion_devices(id) on delete cascade,
  family_id uuid not null references families(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  domains jsonb not null default '[]'::jsonb,  -- [{"d":"example.com","n":12}], top 200 only
  other_count integer not null default 0,
  total_count integer not null default 0,
  created_at timestamptz not null default now(),
  unique (device_id, period_start)              -- a retried upload cannot double-count
);
create index if not exists companion_usage_family_idx on public.companion_usage(family_id, period_end desc);
alter table public.companion_usage enable row level security;
