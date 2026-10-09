-- Grey's daily calisthenics log: one row per child per family date.
create table if not exists public.training_logs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  day date not null,
  rest_day boolean not null default false,
  skills text[] not null default '{}',
  worked_on text,
  win_prompt text,
  win text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, day)
);
alter table public.training_logs enable row level security;
