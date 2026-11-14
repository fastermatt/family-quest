-- A temporary ceiling limits today's already-earned minutes without changing the
-- dated grant ledger or tomorrow's regular allowance.
create table public.family_game_day_caps (
  child_id uuid primary key references public.profiles(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  day date not null,
  minutes integer not null check (minutes between 0 and 1440)
);
alter table public.family_game_day_caps enable row level security;
revoke all on public.family_game_day_caps from public, anon, authenticated;
grant select, insert, update, delete on public.family_game_day_caps to service_role;

create function public.family_set_day_cap(
  p_family uuid, p_child uuid, p_actor uuid, p_minutes integer, p_day date, p_revision integer
) returns void language plpgsql security invoker set search_path = public, pg_temp as $$
declare s family_control_settings;
begin
  perform family_scope(p_family,p_child,p_actor,true);
  select * into s from family_control_settings where child_id=p_child and family_id=p_family for update;
  if coalesce(s.revision,0) is distinct from p_revision or (now() at time zone coalesce(s.timezone,'America/Denver'))::date is distinct from p_day then
    raise exception 'Refresh the current day and rules' using errcode='40001';
  end if;
  if p_minutes is null then
    delete from family_game_day_caps where child_id=p_child and family_id=p_family and day=p_day;
  elsif p_minutes between 0 and 1440 then
    insert into family_game_day_caps(child_id,family_id,day,minutes) values(p_child,p_family,p_day,p_minutes)
    on conflict(child_id) do update set day=excluded.day,minutes=excluded.minutes;
  else
    raise exception 'Invalid daily cap' using errcode='22023';
  end if;
  insert into family_control_settings(family_id,child_id) values(p_family,p_child)
  on conflict(child_id) do update set revision=family_control_settings.revision+1,updated_at=now()
  where family_control_settings.family_id=excluded.family_id;
end $$;
revoke all on function public.family_set_day_cap(uuid,uuid,uuid,integer,date,integer) from public, anon, authenticated;
grant execute on function public.family_set_day_cap(uuid,uuid,uuid,integer,date,integer) to service_role;

-- All parent pause and limit writes, including older PC page requests, advance
-- the policy revision when their actual values change.
create function public.family_bump_pc_limits_revision() returns trigger
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if tg_op = 'UPDATE' then
    if row(new.paused,new.mode,new.gaming_minutes,new.blocked_executables)
      is not distinct from row(old.paused,old.mode,old.gaming_minutes,old.blocked_executables) then
      return new;
    end if;
  end if;
  insert into family_control_settings(family_id,child_id)
  select family_id,id from profiles where id=new.child_id and family_id=new.family_id and role='child'
  on conflict(child_id) do update set revision=family_control_settings.revision+1,updated_at=now()
  where family_control_settings.family_id=excluded.family_id;
  return new;
end $$;
revoke all on function public.family_bump_pc_limits_revision() from public, anon, authenticated;
grant execute on function public.family_bump_pc_limits_revision() to service_role;
create trigger family_pc_limits_revision after insert or update on public.companion_limits
for each row execute function public.family_bump_pc_limits_revision();

create or replace function public.family_game_state(p_family uuid,p_child uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare s family_control_settings; d date; weekend boolean; required_count integer; left_count integer; eligible boolean; granted integer; pc_paused boolean; pc_mode text; legacy_minutes integer; day_cap integer; snapshot record;
begin
 if not exists(select 1 from profiles where id=p_child and family_id=p_family and role='child') then raise exception 'Child not found' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended('family-controls:'||p_child::text,0));
 -- Read the settings revision and its limit values in the same MVCC snapshot.
 select f as settings,l.paused,l.mode,l.gaming_minutes,c.minutes into snapshot
 from profiles p
 left join family_control_settings f on f.child_id=p.id and f.family_id=p.family_id
 left join companion_limits l on l.child_id=p.id and l.family_id=p.family_id
 left join family_game_day_caps c on c.child_id=p.id and c.family_id=p.family_id and c.day=(now() at time zone coalesce(f.timezone,'America/Denver'))::date
 where p.id=p_child and p.family_id=p_family;
 s:=snapshot.settings;
 pc_paused:=snapshot.paused;
 pc_mode:=snapshot.mode;
 legacy_minutes:=snapshot.gaming_minutes;
 day_cap:=snapshot.minutes;
 d:=(now() at time zone coalesce(s.timezone,'America/Denver'))::date; weekend:=extract(dow from d) in(0,6);
 select count(*),count(*) filter(where not(t.status in('approved','excused') or (not coalesce(s.require_parent_approval,false) and t.status='submitted' and coalesce(tt.proof_type,case when tt.photo_required then 'photo' else 'check' end) in('photo','written'))))
 into required_count,left_count from task_instances t join task_templates tt on tt.id=t.template_id
 where t.assigned_to=p_child and t.due_date=d and tt.family_id=p_family and tt.active and coalesce(tt.required,true);
 eligible:=(weekend and not coalesce(s.weekend_requires_chores,false)) or (required_count>0 and left_count=0);
 if s.enabled and eligible then
  insert into family_game_grants(family_id,child_id,day,kind,seconds) values(p_family,p_child,d,'daily',(case when weekend then s.weekend_minutes else s.weekday_minutes end)*60) on conflict(child_id,day,kind) do nothing;
 end if;
 select coalesce(sum(seconds),0) into granted from family_game_grants where family_id=p_family and child_id=p_child and day=d;
 return jsonb_build_object('settings',case when s.child_id is null then null else to_jsonb(s) end,'day',d,'pcPaused',coalesce(pc_paused,false),'pcMode',coalesce(pc_mode,'warn'),'legacyMinutes',legacy_minutes,'todayCapMinutes',day_cap,'eligible',eligible,'requiredCount',required_count,'remainingTasks',left_count,'grantedSeconds',granted,'bathroomGranted',exists(select 1 from family_game_grants where child_id=p_child and kind='bathroom' and weekend_start=(d-((extract(dow from d)::integer+1)%7))));
end $$;

revoke all on function public.family_game_state(uuid,uuid) from public, anon, authenticated;
grant execute on function public.family_game_state(uuid,uuid) to service_role;
