-- Reuse the existing ChoreZap runtime scheduler credential inside encrypted Vault.
-- Neither the secret nor a master vault export is embedded in source or returned to clients.
create function public.companion_presence_authorized(p_token text) returns boolean language sql stable security definer set search_path=pg_catalog,pg_temp as $$
 select length(p_token) between 32 and 256 and exists(
  select 1 from vault.decrypted_secrets where name='chorezap_custom_reminder_secret'
  and extensions.digest(decrypted_secret,'sha256')=extensions.digest(p_token,'sha256')
 );
$$;
revoke all on function public.companion_presence_authorized(text) from public,anon,authenticated;
grant execute on function public.companion_presence_authorized(text) to service_role;

create function public.companion_presence_tick() returns bigint language plpgsql security definer set search_path=pg_catalog,pg_temp as $$
declare credential text;request_id bigint;
begin
 select decrypted_secret into credential from vault.decrypted_secrets where name='chorezap_custom_reminder_secret';
 if credential is null then return null;end if;
 select net.http_post(
  url:='https://app-family-controls.vercel.app/api/cron/companion-presence',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||credential),
  body:='{}'::jsonb,timeout_milliseconds:=10000
 ) into request_id;
 return request_id;
end $$;
revoke all on function public.companion_presence_tick() from public,anon,authenticated,service_role;
-- Paused until the matching handler is deployed and verified.
do $$ declare job bigint;begin
 job:=cron.schedule('chorezap-companion-presence','* * * * *','select public.companion_presence_tick()');
 perform cron.alter_job(job,active:=false);
end $$;
