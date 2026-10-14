-- Parent-managed daily reminders. Access is through family-scoped server routes only.
create table if not exists public.reminder_schedules (
  id uuid primary key default gen_random_uuid(),
  child_id uuid not null references public.profiles(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  time text not null check (time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (child_id, time)
);
alter table public.reminder_schedules enable row level security;
revoke all on public.reminder_schedules from anon, authenticated;
grant select, insert, update, delete on public.reminder_schedules to service_role;
create index if not exists reminder_schedules_due on public.reminder_schedules(time) where enabled;
-- Claude release configuration: invoke /api/cron/custom-reminders every minute
-- with Authorization: Bearer <PUSH_CRON_SECRET> using the protected scheduler.
-- Do not put the secret in this migration or source control.
