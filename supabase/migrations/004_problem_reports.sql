-- 004: in-app "Report a problem"
create table if not exists public.problem_reports (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  family_id uuid references public.families(id) on delete set null,
  profile_id uuid references public.profiles(id) on delete set null,
  role text,
  page text,
  message text not null check (char_length(message) between 1 and 2000),
  recent_errors jsonb not null default '[]'::jsonb,
  user_agent text,
  app_version text,
  status text not null default 'open' check (status in ('open', 'triaged', 'fixed', 'wontfix')),
  notes text
);

create index if not exists problem_reports_created_at_idx on public.problem_reports (created_at desc);

-- Server-only: written and read with the service role. No client policies.
alter table public.problem_reports enable row level security;
