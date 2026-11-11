-- Reconcile dashboard-applied schema, then keep stop credentials on the server.
begin;
create table if not exists public.gaming_alert_log (
 family_id uuid not null, child_id uuid not null, day date not null default current_date,
 pct_threshold integer not null check(pct_threshold in(80,100)), sent_at timestamptz not null default now(),
 primary key(family_id,child_id,day,pct_threshold)
);
create table if not exists public.companion_browse_history (
 family_id uuid not null, child_id uuid not null, day text not null,
 entries jsonb not null default '[]', updated_at timestamptz not null default now(),
 primary key(family_id,child_id,day)
);
alter table public.companion_browse_history add column if not exists coverage jsonb;
alter table public.companion_limits add column if not exists stop_pin text;
alter table public.companion_limits add column if not exists blocked_executables text[] not null default '{}';
alter table public.companion_limits add column if not exists stop_pin_hash text;
-- pgcrypto is already installed in the extensions schema in this project.
update public.companion_limits set stop_pin_hash=extensions.crypt(stop_pin,extensions.gen_salt('bf',12)),stop_pin=null where nullif(stop_pin,'') is not null and stop_pin_hash is null;
update public.companion_limits set stop_pin=null where stop_pin is not null;
create table public.companion_stop_attempts (
 child_id uuid primary key references public.profiles(id) on delete cascade,
 window_started timestamptz not null default now(), attempts integer not null default 0 check(attempts>=0)
);
alter table public.gaming_alert_log enable row level security;
alter table public.companion_browse_history enable row level security;
alter table public.companion_stop_attempts enable row level security;
revoke all on public.gaming_alert_log,public.companion_browse_history,public.companion_stop_attempts from public,anon,authenticated;
grant select,insert,update,delete on public.gaming_alert_log,public.companion_browse_history,public.companion_stop_attempts to service_role;

create function public.companion_set_stop_pin(p_family uuid,p_child uuid,p_actor uuid,p_pin text) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform family_scope(p_family,p_child,p_actor,true);
 if p_pin is not null and p_pin !~ '^[0-9]{4}$' then raise exception 'PIN must contain four digits' using errcode='22023';end if;
 insert into companion_limits(family_id,child_id,stop_pin_hash) values(p_family,p_child,case when p_pin is null then null else extensions.crypt(p_pin,extensions.gen_salt('bf',12)) end)
 on conflict(family_id,child_id) do update set stop_pin=null,stop_pin_hash=excluded.stop_pin_hash;
 delete from companion_stop_attempts where child_id=p_child;
end $$;
create function public.companion_verify_stop(p_client uuid,p_pin text) returns text
language plpgsql security invoker set search_path=public,pg_temp as $$
declare c companion_clients; h text; a companion_stop_attempts;
begin
 select * into c from companion_clients where id=p_client and revoked_at is null for update;
 if not found then raise exception 'Device is not linked' using errcode='42501';end if;
 select stop_pin_hash into h from companion_limits where family_id=c.family_id and child_id=c.child_id;
 if h is null then return 'allowed';end if;
 insert into companion_stop_attempts(child_id) values(c.child_id) on conflict do nothing;
 select * into a from companion_stop_attempts where child_id=c.child_id for update;
 if a.window_started<=now()-interval '15 minutes' then
  update companion_stop_attempts set window_started=now(),attempts=0 where child_id=c.child_id;
  a.attempts:=0;
 end if;
 if a.attempts>=5 then return 'throttled';end if;
 update companion_stop_attempts set attempts=attempts+1 where child_id=c.child_id;
 if p_pin is not null and p_pin ~ '^[0-9]{4}$' and extensions.crypt(p_pin,h)=h then return 'allowed';end if;
 return 'wrong_pin';
end $$;
revoke all on function public.companion_set_stop_pin(uuid,uuid,uuid,text),public.companion_verify_stop(uuid,text) from public,anon,authenticated;
grant execute on function public.companion_set_stop_pin(uuid,uuid,uuid,text),public.companion_verify_stop(uuid,text) to service_role;
commit;
