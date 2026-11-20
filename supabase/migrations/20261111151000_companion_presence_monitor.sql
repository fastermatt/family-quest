-- Cooperative tracker presence: reports observations, never infers intentional tampering.
create table public.companion_presence_settings (
 child_id uuid primary key references public.profiles(id) on delete cascade,
 family_id uuid not null references public.families(id) on delete cascade,
 notify_parent_id uuid references public.profiles(id) on delete set null,
 enabled boolean not null default false,
 enabled_at timestamptz not null default now()
);
create table public.companion_presence_state (
 client_id uuid primary key references public.companion_clients(id) on delete cascade,
 observed_at timestamptz not null,
 status text not null check(status in('online','missing','stop_requested')),
 changed_at timestamptz not null default now()
);
create table public.companion_presence_events (
 id uuid primary key default gen_random_uuid(),
 family_id uuid not null references public.families(id) on delete cascade,
 child_id uuid not null references public.profiles(id) on delete cascade,
 client_id uuid not null references public.companion_clients(id) on delete cascade,
 notify_parent_id uuid references public.profiles(id) on delete set null,
 kind text not null check(kind in('stop_requested','checkin_missing','checkin_restored')),
 occurred_at timestamptz not null default now(),
 reference_at timestamptz not null,
 device_name text not null,
 push_attempted_at timestamptz,
 push_delivered integer not null default 0 check(push_delivered>=0),
 unique(client_id,kind,reference_at)
);
create index companion_presence_events_family_recent on public.companion_presence_events(family_id,child_id,occurred_at desc);
create index companion_presence_events_pending on public.companion_presence_events(occurred_at) where push_attempted_at is null;
alter table public.companion_presence_settings enable row level security;
alter table public.companion_presence_state enable row level security;
alter table public.companion_presence_events enable row level security;
revoke all on public.companion_presence_settings,public.companion_presence_state,public.companion_presence_events from public,anon,authenticated;
grant all on public.companion_presence_settings,public.companion_presence_state,public.companion_presence_events to service_role;

create function public.companion_presence_settings_save(p_family uuid,p_child uuid,p_actor uuid,p_enabled boolean) returns void language plpgsql security definer set search_path=public,pg_temp as $$
begin
 perform public.family_scope(p_family,p_child,p_actor,true);
 if p_enabled is null then raise exception 'Invalid monitoring setting';end if;
 insert into companion_presence_settings(child_id,family_id,notify_parent_id,enabled,enabled_at) values(p_child,p_family,p_actor,p_enabled,now())
 on conflict(child_id) do update set enabled=excluded.enabled,notify_parent_id=excluded.notify_parent_id,enabled_at=case when companion_presence_settings.enabled<>excluded.enabled then now() else companion_presence_settings.enabled_at end;
 -- Re-arming starts with the next real heartbeat, not yesterday's offline PC.
 if not p_enabled then
  delete from companion_presence_state where client_id in(select id from companion_clients where child_id=p_child and family_id=p_family);
  update companion_presence_events set push_attempted_at=now() where child_id=p_child and family_id=p_family and push_attempted_at is null;
 end if;
end $$;

create function public.companion_presence_stop(p_client uuid) returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare c companion_clients%rowtype;s companion_presence_settings%rowtype;
begin
 select * into c from companion_clients where id=p_client and revoked_at is null for update;
 if not found then raise exception 'Device unavailable';end if;
 select * into s from companion_presence_settings where child_id=c.child_id and family_id=c.family_id;
 if not found or not s.enabled then return;end if;
 insert into companion_presence_state(client_id,observed_at,status,changed_at) values(c.id,coalesce(c.last_seen_at,now()),'stop_requested',now())
 on conflict(client_id) do update set status='stop_requested',changed_at=now(),observed_at=excluded.observed_at;
 insert into companion_presence_events(family_id,child_id,client_id,notify_parent_id,kind,reference_at,device_name)
 values(c.family_id,c.child_id,c.id,s.notify_parent_id,'stop_requested',date_trunc('minute',now()),left(coalesce(c.name,'Linked PC'),100)) on conflict do nothing;
end $$;

create function public.companion_presence_scan() returns void language plpgsql security definer set search_path=public,pg_temp as $$
declare c record;s companion_presence_state%rowtype;
begin
 -- Serialize scans; each client lock also serializes Stop requests against scans.
 if not pg_try_advisory_xact_lock(817263914) then return;end if;
 for c in select cc.*,ps.notify_parent_id from companion_clients cc join companion_presence_settings ps on ps.child_id=cc.child_id and ps.family_id=cc.family_id
 where ps.enabled and cc.revoked_at is null and cc.last_seen_at>=ps.enabled_at for update of cc
 loop
  select * into s from companion_presence_state where client_id=c.id for update;
  if not found then
   insert into companion_presence_state(client_id,observed_at,status) values(c.id,c.last_seen_at,'online') returning * into s;
  end if;
  -- Ignore final in-flight requests for 60 seconds after an authorized Stop.
  if s.status<>'online' and c.last_seen_at>now()-interval '10 minutes' and c.last_seen_at>s.observed_at and c.last_seen_at>(case when s.status='stop_requested' then s.changed_at+interval '60 seconds' else s.changed_at end) then
   insert into companion_presence_events(family_id,child_id,client_id,notify_parent_id,kind,reference_at,device_name)
   values(c.family_id,c.child_id,c.id,c.notify_parent_id,'checkin_restored',c.last_seen_at,left(coalesce(c.name,'Linked PC'),100)) on conflict do nothing;
   update companion_presence_state set status='online',observed_at=c.last_seen_at,changed_at=now() where client_id=c.id;
   s.status:='online';
  elsif s.status='online' then
   update companion_presence_state set observed_at=c.last_seen_at where client_id=c.id;
  end if;
  if s.status='online' and c.last_seen_at<=now()-interval '10 minutes' then
   insert into companion_presence_events(family_id,child_id,client_id,notify_parent_id,kind,reference_at,device_name)
   values(c.family_id,c.child_id,c.id,c.notify_parent_id,'checkin_missing',c.last_seen_at,left(coalesce(c.name,'Linked PC'),100)) on conflict do nothing;
   update companion_presence_state set status='missing',observed_at=c.last_seen_at,changed_at=now() where client_id=c.id;
  end if;
 end loop;
 -- Short audit retention; do not delete financial or task history.
 delete from companion_presence_events where occurred_at<now()-interval '30 days';
end $$;

create function public.companion_presence_claim() returns setof public.companion_presence_events language sql security definer set search_path=public,pg_temp as $$
 with picked as (
  select e.id from companion_presence_events e join companion_presence_settings s on s.child_id=e.child_id and s.family_id=e.family_id
  join companion_clients c on c.id=e.client_id and c.revoked_at is null
  where s.enabled and e.push_attempted_at is null and e.occurred_at>=now()-interval '1 day'
  order by e.occurred_at limit 50 for update of e skip locked
 ) update companion_presence_events e set push_attempted_at=now() from picked where e.id=picked.id returning e.*;
$$;
revoke all on function public.companion_presence_settings_save(uuid,uuid,uuid,boolean), public.companion_presence_stop(uuid), public.companion_presence_scan(), public.companion_presence_claim() from public,anon,authenticated;
grant execute on function public.companion_presence_settings_save(uuid,uuid,uuid,boolean), public.companion_presence_stop(uuid), public.companion_presence_scan(), public.companion_presence_claim() to service_role;
