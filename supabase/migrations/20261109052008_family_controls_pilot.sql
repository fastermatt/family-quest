-- Household pilot: separate time grants, offered jobs and money. No live seed data.
begin;
create table public.family_control_settings (
 family_id uuid not null references public.families(id) on delete cascade,
 child_id uuid primary key references public.profiles(id) on delete cascade,
 enabled boolean not null default false,
 game_privilege_id uuid references public.privileges(id),
 timezone text not null default 'America/Denver' check(timezone='America/Denver'),
 weekday_minutes integer not null default 120 check(weekday_minutes between 0 and 720),
 weekend_minutes integer not null default 120 check(weekend_minutes between 0 and 720),
 bathroom_bonus_minutes integer not null default 60 check(bathroom_bonus_minutes between 0 and 240),
 weekend_requires_chores boolean not null default false,
 require_parent_approval boolean not null default false,
 school_windows jsonb not null default '[]' check(jsonb_typeof(school_windows)='array'),
 gaming_windows jsonb not null default '[]' check(jsonb_typeof(gaming_windows)='array'),
 bedtime_windows jsonb not null default '[]' check(jsonb_typeof(bedtime_windows)='array'),
 revision integer not null default 1 check(revision>0),
 updated_at timestamptz not null default now()
);
create table public.family_game_grants (
 id uuid primary key default gen_random_uuid(), family_id uuid not null references public.families(id) on delete cascade,
 child_id uuid not null references public.profiles(id) on delete cascade, day date not null,
 kind text not null check(kind in('daily','bathroom')), seconds integer not null check(seconds between 0 and 43200),
 weekend_start date, note text not null default '', created_by uuid references public.profiles(id),
 created_at timestamptz not null default now(), unique(child_id,day,kind),
 check((kind='bathroom' and weekend_start is not null and extract(dow from weekend_start)=6 and day between weekend_start and weekend_start+1) or (kind='daily' and weekend_start is null))
);
create unique index family_bathroom_once on public.family_game_grants(child_id,weekend_start) where kind='bathroom';
create table public.family_money_accounts (
 child_id uuid primary key references public.profiles(id) on delete cascade, family_id uuid not null references public.families(id) on delete cascade,
 initialized boolean not null default false,
 debt_remaining_cents integer not null default 0 check(debt_remaining_cents between 0 and 100000000),
 cash_owed_cents integer not null default 0 check(cash_owed_cents between 0 and 100000000)
);
create table public.family_job_offers (
 id uuid primary key default gen_random_uuid(), family_id uuid not null references public.families(id) on delete cascade,
 child_id uuid not null references public.profiles(id) on delete cascade,
 title text not null check(length(title) between 1 and 100), description text not null check(length(description) between 1 and 2000),
 criteria text not null check(length(criteria) between 1 and 1000), price_cents integer not null check(price_cents between 1 and 1000000),
 status text not null default 'offered' check(status in('offered','accepted','submitted','changes_requested','approved','cancelled')),
 child_note text, review_note text, created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index family_job_child on public.family_job_offers(family_id,child_id,created_at desc);
create table public.family_money_entries (
 id uuid primary key default gen_random_uuid(), family_id uuid not null references public.families(id) on delete cascade,
 child_id uuid not null references public.profiles(id) on delete cascade,
 kind text not null check(kind in('opening_iou','job_credit','cash_settlement')),
 description text not null, debt_delta_cents integer not null, cash_delta_cents integer not null,
 job_id uuid references public.family_job_offers(id), request_id uuid,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 check((kind='opening_iou' and debt_delta_cents>=0 and cash_delta_cents=0 and job_id is null) or
       (kind='job_credit' and debt_delta_cents<=0 and cash_delta_cents>=0 and job_id is not null and -debt_delta_cents+cash_delta_cents>0) or
       (kind='cash_settlement' and debt_delta_cents=0 and cash_delta_cents<0 and request_id is not null))
);
create unique index family_job_credit_once on public.family_money_entries(job_id) where job_id is not null;
create unique index family_iou_once on public.family_money_entries(child_id) where kind='opening_iou';
create unique index family_cash_request_once on public.family_money_entries(child_id,request_id) where request_id is not null;
create index family_money_history on public.family_money_entries(family_id,child_id,created_at desc);
alter table public.companion_clients add column applied_revision integer, add column applied_at timestamptz;

-- No browser roles can read or mutate this PIN-session data directly.
alter table public.family_control_settings enable row level security;
alter table public.family_game_grants enable row level security;
alter table public.family_money_accounts enable row level security;
alter table public.family_job_offers enable row level security;
alter table public.family_money_entries enable row level security;
revoke all on public.family_control_settings,public.family_game_grants,public.family_money_accounts,public.family_job_offers,public.family_money_entries from public,anon,authenticated;
grant select,insert,update,delete on public.family_control_settings,public.family_game_grants,public.family_money_accounts,public.family_job_offers,public.family_money_entries to service_role;

create function public.family_scope(p_family uuid,p_child uuid,p_actor uuid,p_parent boolean) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from profiles where id=p_child and family_id=p_family and role='child') then raise exception 'Child not found' using errcode='P0002'; end if;
 if p_parent then
  if not exists(select 1 from profiles where id=p_actor and family_id=p_family and role='parent') then raise exception 'Parents only' using errcode='42501'; end if;
 elsif p_actor<>p_child then raise exception 'Child identity mismatch' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended('family-controls:'||p_child::text,0));
end $$;

create function public.family_save_settings(p_family uuid,p_child uuid,p_actor uuid,p_settings jsonb) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare current_revision integer;
begin
 perform family_scope(p_family,p_child,p_actor,true);
 select revision into current_revision from family_control_settings where child_id=p_child;
 if coalesce(current_revision,0)<>(p_settings->>'revision')::integer then raise exception 'Settings changed; reload before saving' using errcode='40001';end if;
 if (p_settings->>'game_privilege_id') is not null and not exists(select 1 from privileges where id=(p_settings->>'game_privilege_id')::uuid and family_id=p_family) then raise exception 'Reward not found' using errcode='P0002';end if;
 if (p_settings->>'enabled')::boolean and (p_settings->>'game_privilege_id') is null then raise exception 'Choose a game reward' using errcode='22023';end if;
 insert into family_control_settings(family_id,child_id,enabled,game_privilege_id,timezone,weekday_minutes,weekend_minutes,bathroom_bonus_minutes,weekend_requires_chores,require_parent_approval,school_windows,gaming_windows,bedtime_windows,revision)
 values(p_family,p_child,(p_settings->>'enabled')::boolean,(p_settings->>'game_privilege_id')::uuid,p_settings->>'timezone',(p_settings->>'weekday_minutes')::integer,(p_settings->>'weekend_minutes')::integer,(p_settings->>'bathroom_bonus_minutes')::integer,(p_settings->>'weekend_requires_chores')::boolean,(p_settings->>'require_parent_approval')::boolean,p_settings->'school_windows',p_settings->'gaming_windows',p_settings->'bedtime_windows',coalesce(current_revision,0)+1)
 on conflict(child_id) do update set enabled=excluded.enabled,game_privilege_id=excluded.game_privilege_id,timezone=excluded.timezone,weekday_minutes=excluded.weekday_minutes,weekend_minutes=excluded.weekend_minutes,bathroom_bonus_minutes=excluded.bathroom_bonus_minutes,weekend_requires_chores=excluded.weekend_requires_chores,require_parent_approval=excluded.require_parent_approval,school_windows=excluded.school_windows,gaming_windows=excluded.gaming_windows,bedtime_windows=excluded.bedtime_windows,revision=excluded.revision,updated_at=now();
end $$;

-- Read current proof gate and mint a dated, immutable daily grant at most once.
-- Never infer completion from an empty/missing required task list on gated days.
create function public.family_game_state(p_family uuid,p_child uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare s family_control_settings; d date; weekend boolean; required_count integer; left_count integer; eligible boolean; granted integer;
begin
 if not exists(select 1 from profiles where id=p_child and family_id=p_family and role='child') then raise exception 'Child not found' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended('family-controls:'||p_child::text,0));
 select * into s from family_control_settings where child_id=p_child and family_id=p_family;
 d:=(now() at time zone coalesce(s.timezone,'America/Denver'))::date; weekend:=extract(dow from d) in(0,6);
 select count(*),count(*) filter(where not(t.status in('approved','excused') or (not coalesce(s.require_parent_approval,false) and t.status='submitted' and coalesce(tt.proof_type,case when tt.photo_required then 'photo' else 'check' end) in('photo','written'))))
 into required_count,left_count from task_instances t join task_templates tt on tt.id=t.template_id
 where t.assigned_to=p_child and t.due_date=d and tt.family_id=p_family and tt.active and coalesce(tt.required,true);
 eligible:=(weekend and not coalesce(s.weekend_requires_chores,false)) or (required_count>0 and left_count=0);
 if s.enabled and eligible then
  insert into family_game_grants(family_id,child_id,day,kind,seconds) values(p_family,p_child,d,'daily',(case when weekend then s.weekend_minutes else s.weekday_minutes end)*60) on conflict(child_id,day,kind) do nothing;
 end if;
 select coalesce(sum(seconds),0) into granted from family_game_grants where family_id=p_family and child_id=p_child and day=d;
 return jsonb_build_object('settings',case when s.child_id is null then null else to_jsonb(s) end,'day',d,'eligible',eligible,'requiredCount',required_count,'remainingTasks',left_count,'grantedSeconds',granted,'bathroomGranted',exists(select 1 from family_game_grants where child_id=p_child and kind='bathroom' and weekend_start=(d-((extract(dow from d)::integer+1)%7))));
end $$;

create function public.family_bathroom_bonus(p_family uuid,p_child uuid,p_actor uuid,p_note text) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare s family_control_settings; d date;
begin
 perform family_scope(p_family,p_child,p_actor,true);
 select * into s from family_control_settings where child_id=p_child and family_id=p_family;
 if not coalesce(s.enabled,false) then raise exception 'Enable family game rules first' using errcode='22023';end if;
 d:=(now() at time zone s.timezone)::date;
 if extract(dow from d) not in(0,6) then raise exception 'Bathroom bonus is available on weekends' using errcode='22023';end if;
 if length(trim(coalesce(p_note,'')))<1 or length(p_note)>500 then raise exception 'Confirm the completed work' using errcode='22023';end if;
 insert into family_game_grants(family_id,child_id,day,kind,seconds,weekend_start,note,created_by)
 values(p_family,p_child,d,'bathroom',s.bathroom_bonus_minutes*60,d-(case when extract(dow from d)=0 then 1 else 0 end),p_note,p_actor)
 on conflict do nothing;
end $$;

create function public.family_money_action(p_family uuid,p_child uuid,p_actor uuid,p_action text,p_body jsonb) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare a family_money_accounts; j family_job_offers; e family_money_entries; amount integer; repayment integer; req uuid; note text; decision text;
begin
 perform family_scope(p_family,p_child,p_actor,p_action not in('accept-job','submit-job'));
 insert into family_money_accounts(child_id,family_id) values(p_child,p_family) on conflict do nothing;
 select * into a from family_money_accounts where child_id=p_child and family_id=p_family for update;
 if not found then raise exception 'Account not found' using errcode='P0002';end if;
 if p_action='open-iou' then
  amount:=(p_body->>'amountCents')::integer;note:=trim(p_body->>'description');
  if amount is null or amount<0 or amount>1000000 or coalesce(length(note),0) not between 1 and 200 then raise exception 'Invalid IOU' using errcode='22023';end if;
  if a.initialized then
   if exists(select 1 from family_money_entries where child_id=p_child and kind='opening_iou' and debt_delta_cents=amount and description=note) then return;end if;
   raise exception 'IOU already initialized' using errcode='40001';
  end if;
  update family_money_accounts set initialized=true,debt_remaining_cents=amount where child_id=p_child;
  insert into family_money_entries(family_id,child_id,kind,description,debt_delta_cents,cash_delta_cents,created_by) values(p_family,p_child,'opening_iou',note,amount,0,p_actor);
 elsif p_action='offer-job' then
  if not a.initialized then raise exception 'Set the IOU balance first (zero is allowed)' using errcode='22023';end if;
  insert into family_job_offers(family_id,child_id,title,description,criteria,price_cents,created_by)
  values(p_family,p_child,trim(p_body->>'title'),trim(p_body->>'description'),trim(p_body->>'criteria'),(p_body->>'priceCents')::integer,p_actor);
 elsif p_action='settle-cash' then
  amount:=(p_body->>'amountCents')::integer;req:=(p_body->>'requestId')::uuid;
  if amount is null or amount<1 or req is null then raise exception 'Invalid payment' using errcode='22023';end if;
  select * into e from family_money_entries where child_id=p_child and request_id=req;
  if found then
   if e.kind='cash_settlement' and e.cash_delta_cents=-amount then return;end if;
   raise exception 'Payment request conflicts with receipt' using errcode='40001';
  end if;
  if amount>a.cash_owed_cents then raise exception 'Payment exceeds cash owed' using errcode='22023';end if;
  update family_money_accounts set cash_owed_cents=cash_owed_cents-amount where child_id=p_child;
  insert into family_money_entries(family_id,child_id,kind,description,debt_delta_cents,cash_delta_cents,request_id,created_by) values(p_family,p_child,'cash_settlement','Payment recorded by parent',0,-amount,req,p_actor);
 elsif p_action in('accept-job','submit-job','review-job') then
  select * into j from family_job_offers where id=(p_body->>'jobId')::uuid and family_id=p_family and child_id=p_child for update;
  if not found then raise exception 'Job not found' using errcode='P0002';end if;
  note:=left(trim(coalesce(p_body->>'note','')),1000);
  if p_action='accept-job' then
   if j.status='accepted' then return;end if;
   if j.status<>'offered' then raise exception 'Job is not available' using errcode='40001';end if;
   update family_job_offers set status='accepted',updated_at=now() where id=j.id;
  elsif p_action='submit-job' then
   if j.status='submitted' then return;end if;
   if j.status not in('accepted','changes_requested') then raise exception 'Accept this job before submitting it' using errcode='40001';end if;
   if length(note)<1 then raise exception 'Describe the completed work' using errcode='22023';end if;
   update family_job_offers set status='submitted',child_note=note,updated_at=now() where id=j.id;
  else
   decision:=p_body->>'decision';
   if decision='approve' then
    if j.status='approved' then return;end if;
    if j.status<>'submitted' then raise exception 'Only submitted jobs can be approved' using errcode='40001';end if;
    repayment:=least(a.debt_remaining_cents,j.price_cents);
    insert into family_money_entries(family_id,child_id,kind,description,debt_delta_cents,cash_delta_cents,job_id,created_by) values(p_family,p_child,'job_credit',j.title,-repayment,j.price_cents-repayment,j.id,p_actor);
    update family_money_accounts set debt_remaining_cents=debt_remaining_cents-repayment,cash_owed_cents=cash_owed_cents+j.price_cents-repayment where child_id=p_child;
    update family_job_offers set status='approved',review_note=note,updated_at=now() where id=j.id;
   elsif decision='changes_requested' then
    if j.status<>'submitted' or length(note)<1 then raise exception 'Describe what needs fixing on the submitted job' using errcode='22023';end if;
    update family_job_offers set status='changes_requested',review_note=note,updated_at=now() where id=j.id;
   elsif decision='cancel' then
    if j.status not in('offered','accepted','changes_requested') then raise exception 'This job cannot be cancelled' using errcode='40001';end if;
    update family_job_offers set status='cancelled',review_note=note,updated_at=now() where id=j.id;
   else raise exception 'Unknown review decision' using errcode='22023';end if;
  end if;
 else raise exception 'Unknown action' using errcode='22023';end if;
end $$;

-- Approval and XP must commit together; a retry returns the existing receipt.
create function public.family_approve_task(p_family uuid,p_actor uuid,p_task uuid,p_note text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare t task_instances; xp integer;
begin
 select * into t from task_instances where id=p_task for update;
 if not found then raise exception 'Chore not found' using errcode='P0002';end if;
 perform family_scope(p_family,t.assigned_to,p_actor,true);
 if t.status='approved' then return jsonb_build_object('xp',t.xp_awarded,'duplicate',true);end if;
 if t.status<>'submitted' then raise exception 'Already reviewed' using errcode='40001';end if;
 select xp_value into xp from task_templates where id=t.template_id and family_id=p_family;
 if not found then raise exception 'Chore not found' using errcode='P0002';end if;
 xp:=coalesce(xp,0);
 update task_instances set status='approved',reviewed_at=now(),xp_awarded=xp,review_note=nullif(left(p_note,300),'') where id=t.id;
 perform award_xp(t.assigned_to,p_family,xp);
 return jsonb_build_object('xp',xp,'duplicate',false);
end $$;
revoke all on function public.family_scope(uuid,uuid,uuid,boolean),public.family_save_settings(uuid,uuid,uuid,jsonb),public.family_game_state(uuid,uuid),public.family_bathroom_bonus(uuid,uuid,uuid,text),public.family_money_action(uuid,uuid,uuid,text,jsonb),public.family_approve_task(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.family_scope(uuid,uuid,uuid,boolean),public.family_save_settings(uuid,uuid,uuid,jsonb),public.family_game_state(uuid,uuid),public.family_bathroom_bonus(uuid,uuid,uuid,text),public.family_money_action(uuid,uuid,uuid,text,jsonb),public.family_approve_task(uuid,uuid,uuid,text) to service_role;
grant execute on function public.award_xp(uuid,uuid,integer) to service_role;
commit;
