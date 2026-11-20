-- Reduce Disk IO on the free-tier compute.
-- The presence tick ran every minute; each run writes a cron log row and a pg_net
-- request/response, and anything writing more often than checkpoint_timeout (5 min)
-- keeps Postgres checkpointing 12x/hour. Missing check-ins are reported after
-- PRESENCE_THRESHOLD_MINUTES (10); a 10-minute tick reports them within ~20 minutes.
-- Already applied to production on 2026-11-12.
select cron.alter_job(job_id := (select jobid from cron.job where jobname = 'chorezap-companion-presence'), schedule := '*/10 * * * *')
where exists (select 1 from cron.job where jobname = 'chorezap-companion-presence');

-- pg_cron keeps every run forever; keep three days.
select cron.schedule('purge-cron-history', '41 9 * * *', $$delete from cron.job_run_details where end_time < now() - interval '3 days'$$);
