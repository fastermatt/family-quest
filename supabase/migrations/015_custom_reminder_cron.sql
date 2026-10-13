-- Secret is provisioned separately in Supabase Vault, never in source control.
select cron.schedule(
  'chorezap-custom-reminders',
  '* * * * *',
  $job$
  select net.http_post(
    url := 'https://family-tasks-deploy.vercel.app/api/cron/custom-reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'chorezap_custom_reminder_secret' limit 1)),
    body := '{}'::jsonb,
    timeout_milliseconds := 15000
  );
  $job$
);
