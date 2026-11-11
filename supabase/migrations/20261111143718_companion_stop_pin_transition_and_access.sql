begin;
-- Older web deployments may still post stop_pin during a rolling deploy.
-- Immediately hash and erase it so no policy/API can read the plaintext back.
create function public.companion_hash_legacy_stop_pin() returns trigger
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if new.stop_pin is not null then
  if new.stop_pin !~ '^[0-9]{4}$' then raise exception 'PIN must contain four digits' using errcode='22023';end if;
  new.stop_pin_hash:=extensions.crypt(new.stop_pin,extensions.gen_salt('bf',12));
  new.stop_pin:=null;
 end if;
 return new;
end $$;
create trigger companion_hash_legacy_stop_pin before insert or update of stop_pin on public.companion_limits
 for each row execute function public.companion_hash_legacy_stop_pin();
revoke all on function public.companion_hash_legacy_stop_pin() from public,anon,authenticated;
grant execute on function public.companion_hash_legacy_stop_pin() to service_role;

-- This unused view included access_token and bypassed profiles RLS.
-- App routes use the scoped server client; no browser needs this view.
alter view public.public_profiles set (security_invoker=true);
revoke all on public.public_profiles from public,anon,authenticated;
grant select on public.public_profiles to service_role;
alter function public.cleanup_old_pin_attempts() set search_path=public,pg_temp;
revoke all on function public.cleanup_old_pin_attempts() from public,anon,authenticated;
grant execute on function public.cleanup_old_pin_attempts() to service_role;
commit;
