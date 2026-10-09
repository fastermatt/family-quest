-- Question of the day: one answer per child per family date.
create table if not exists public.reflections (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  day date not null,
  question text not null,
  answer text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, day)
);
-- Server routes use the service role; no client policies.
alter table public.reflections enable row level security;
