-- One reminder run per slot per Denver day (the scheduler calls without a secret).
create table if not exists public.reminder_runs (
  slot text not null,
  day date not null,
  ran_at timestamptz not null default now(),
  primary key (slot, day)
);
alter table public.reminder_runs enable row level security;
-- Push subscriptions: one row per endpoint.
create unique index if not exists push_subscriptions_endpoint_key on push_subscriptions(endpoint);
-- Schedules (pg_cron, UTC; both MDT and MST times, the app keeps the right one):
--   morning 0 13,14 * * *   afternoon 30 21,22 * * *   four 0 22,23 * * *   evening 30 2,3 * * *
-- each: select net.http_post(url := 'https://family-tasks-deploy.vercel.app/api/cron/remind?slot=<slot>', body := '{}'::jsonb);
