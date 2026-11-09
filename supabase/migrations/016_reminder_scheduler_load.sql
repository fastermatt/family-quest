-- Wake only near enabled reminder times. Both Denver UTC offsets are included;
-- the exact Denver time is checked before enqueueing any network request.
create or replace function public.sync_reminder_cron()
returns trigger language plpgsql security definer set search_path = pg_catalog as $$
declare scheduler_id bigint; minute_list text; hour_list text;
begin
  perform pg_advisory_xact_lock(706142);
  select jobid into scheduler_id from cron.job where jobname = 'chorezap-custom-reminders';
  if scheduler_id is null then raise exception 'Reminder scheduler is not installed'; end if;
  select string_agg(m::text, ',' order by m) into minute_list
    from (select distinct split_part(time, ':', 2)::int m from public.reminder_schedules where enabled) minutes;
  select string_agg(h::text, ',' order by h) into hour_list
    from (select distinct (split_part(time, ':', 1)::int + offset_hours) % 24 h
      from public.reminder_schedules cross join (values (6),(7)) offsets(offset_hours) where enabled) hours;
  if minute_list is null then
    perform cron.alter_job(scheduler_id, active := false);
  else
    perform cron.alter_job(scheduler_id, schedule := minute_list || ' ' || hour_list || ' * * *', active := true);
  end if;
  return null;
end;
$$;
revoke all on function public.sync_reminder_cron() from public, anon, authenticated;
drop trigger if exists reminder_schedule_cron_sync on public.reminder_schedules;
create trigger reminder_schedule_cron_sync after insert or update or delete on public.reminder_schedules for each statement execute function public.sync_reminder_cron();
select cron.alter_job(
  (select jobid from cron.job where jobname = 'chorezap-custom-reminders'),
  command := $job$
  select net.http_post(
    url := 'https://family-tasks-deploy.vercel.app/api/cron/custom-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'chorezap_custom_reminder_secret' limit 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  ) where exists (
    select 1 from public.reminder_schedules where enabled
      and time = to_char(current_timestamp at time zone 'America/Denver', 'HH24:MI')
  );
  $job$
);
-- Statement trigger synchronizes the existing enabled schedules immediately.
update public.reminder_schedules set enabled = enabled;
