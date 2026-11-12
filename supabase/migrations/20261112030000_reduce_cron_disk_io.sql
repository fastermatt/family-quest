-- Reduce Disk IO on the free-tier compute.
-- The presence tick ran every minute; each run writes a cron log row and a pg_net
-- request/response. Missing check-ins are only reported after
-- PRESENCE_THRESHOLD_MINUTES (10), so a 5-minute tick still detects them in time
-- (worst case ~15 minutes instead of ~11). Already applied to production on 2026-11-12.
select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'chorezap-companion-presence'), schedule := '*/5 * * * *')
where exists (select 1 from cron.job where jobname = 'chorezap-companion-presence');

-- pg_cron keeps every run forever; keep three days.
select cron.schedule('purge-cron-history', '41 9 * * *', $$delete from cron.job_run_details where end_time < now() - interval '3 days'$$);
