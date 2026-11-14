begin;
create table public.companion_clients (
 id uuid primary key default gen_random_uuid(), family_id uuid not null references public.families(id) on delete cascade,
 child_id uuid not null references public.profiles(id) on delete cascade, token_hash text not null unique,
 account_tag text not null, name text not null, last_seen_at timestamptz, version text, revoked_at timestamptz,
 created_at timestamptz not null default now(), check(token_hash ~ '^[a-f0-9]{64}$'),check(account_tag ~ '^[a-f0-9]{64}$')
);
create unique index companion_clients_account on public.companion_clients(family_id,child_id,account_tag) where revoked_at is null;
create table public.companion_enrollments (
 claim_hash text primary key, token_hash text not null unique, account_tag text not null, name text not null,
 expires_at timestamptz not null default now()+interval '15 minutes', client_id uuid references public.companion_clients(id) on delete cascade,
 check(claim_hash ~ '^[a-f0-9]{64}$'),check(token_hash ~ '^[a-f0-9]{64}$'),check(account_tag ~ '^[a-f0-9]{64}$')
);
create table public.companion_app_rules (
 family_id uuid not null references public.families(id) on delete cascade,child_id uuid not null references public.profiles(id) on delete cascade,
 executable text not null,label text not null,category text not null check(category in('game','school','other')),
 daily_minutes integer check(daily_minutes between 0 and 1440),primary key(family_id,child_id,executable)
);
create table public.companion_limits (
 family_id uuid not null references public.families(id) on delete cascade,child_id uuid not null references public.profiles(id) on delete cascade,
 gaming_minutes integer check(gaming_minutes between 0 and 1440),paused boolean not null default false,
 mode text not null default 'warn' check(mode in('warn','close')),primary key(family_id,child_id)
);
create table public.companion_activity (
 client_id uuid not null references public.companion_clients(id) on delete cascade,batch_id uuid not null,
 family_id uuid not null references public.families(id) on delete cascade,child_id uuid not null references public.profiles(id) on delete cascade,
 period_start timestamptz not null,period_end timestamptz not null,day date not null,apps jsonb not null,
 gaps double precision not null check(gaps>=0),version text not null,payload_hash text not null,
 primary key(client_id,batch_id),check(period_end>period_start),check(period_end-period_start<=interval '6 minutes')
);
create index companion_activity_child_day on public.companion_activity(family_id,child_id,day);
alter table public.companion_clients enable row level security;
alter table public.companion_enrollments enable row level security;
alter table public.companion_app_rules enable row level security;
alter table public.companion_limits enable row level security;
alter table public.companion_activity enable row level security;
revoke all on public.companion_clients,public.companion_enrollments,public.companion_app_rules,public.companion_limits,public.companion_activity from anon,authenticated;
grant all on public.companion_clients,public.companion_enrollments,public.companion_app_rules,public.companion_limits,public.companion_activity to service_role;

create function public.companion_v2_enroll(p_claim text,p_token text,p_account text,p_name text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 perform pg_advisory_xact_lock(hashtext('companion_v2_enroll'));
 if p_claim !~ '^[a-f0-9]{64}$' or p_token !~ '^[a-f0-9]{64}$' or p_account !~ '^[a-f0-9]{64}$' then return jsonb_build_object('error','invalid_enrollment');end if;
 if exists(select 1 from companion_enrollments where claim_hash=p_claim and token_hash=p_token and expires_at>now()) then return '{}'::jsonb;end if;
 delete from companion_enrollments where expires_at<now();
 if (select count(*) from companion_enrollments where client_id is null)>19 then return jsonb_build_object('error','Enrollment busy; retry later.');end if;
 insert into companion_enrollments(claim_hash,token_hash,account_tag,name) values(p_claim,p_token,p_account,left(p_name,60));
 return '{}'::jsonb;
end $$;

create function public.companion_v2_claim(p_claim text,p_family uuid,p_child uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare e companion_enrollments; c uuid;
begin
 if not exists(select 1 from profiles where id=p_child and family_id=p_family and role='child') then return jsonb_build_object('error','Child not found.');end if;
 select * into e from companion_enrollments where claim_hash=p_claim and expires_at>now() for update;
 if not found then return jsonb_build_object('error','Code expired or not found.');end if;
 if e.client_id is not null then
  if exists(select 1 from companion_clients where id=e.client_id and family_id=p_family and child_id=p_child) then return jsonb_build_object('clientId',e.client_id);end if;
  return jsonb_build_object('error','Code already used.');
 end if;
 if exists(select 1 from companion_clients where family_id=p_family and child_id=p_child and account_tag=e.account_tag and revoked_at is null) then return jsonb_build_object('error','This Windows account is already linked. Unlink the old PC entry first.');end if;
 insert into companion_clients(family_id,child_id,token_hash,account_tag,name) values(p_family,p_child,e.token_hash,e.account_tag,e.name) returning id into c;
 update companion_enrollments set client_id=c where claim_hash=p_claim;
 return jsonb_build_object('clientId',c);
end $$;

create function public.companion_v2_record(p_client uuid,p_batch uuid,p_start timestamptz,p_end timestamptz,p_apps jsonb,p_gaps double precision,p_version text,p_hash text) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare c companion_clients; previous text; total double precision;
begin
 select * into c from companion_clients where id=p_client and revoked_at is null for update;
 if not found then return jsonb_build_object('error','revoked');end if;
 select payload_hash into previous from companion_activity where client_id=p_client and batch_id=p_batch;
 if found then
  if previous=p_hash then return jsonb_build_object('duplicate',true);end if;
  return jsonb_build_object('error','batch_conflict');
 end if;
 if p_end<=p_start or p_end-p_start>interval '6 minutes' or p_start<now()-interval '14 days' or p_end>now()+interval '2 minutes' or p_gaps<0 or jsonb_typeof(p_apps)<>'array' or jsonb_array_length(p_apps)>100 then return jsonb_build_object('error','invalid_batch');end if;
 if (p_start at time zone 'America/Denver')::date<>((p_end-interval '1 microsecond') at time zone 'America/Denver')::date then return jsonb_build_object('error','split_midnight');end if;
 select coalesce(sum((a->>'seconds')::double precision),0)+p_gaps into total from jsonb_array_elements(p_apps) a;
 if abs(total-extract(epoch from p_end-p_start))>1 then return jsonb_build_object('error','invalid_total');end if;
 if exists(select 1 from companion_activity where client_id=p_client and period_start<p_end and period_end>p_start) then return jsonb_build_object('error','overlap');end if;
 if (select count(*) from companion_activity where client_id=p_client and period_end>now()-interval '24 hours')>=350 then return jsonb_build_object('error','rate_limit');end if;
 insert into companion_activity values(c.id,p_batch,c.family_id,c.child_id,p_start,p_end,(p_start at time zone 'America/Denver')::date,p_apps,p_gaps,left(p_version,30),p_hash);
 update companion_clients set last_seen_at=now(),version=left(p_version,30) where id=c.id;
 delete from companion_activity where client_id=c.id and period_end<now()-interval '14 days';
 return '{}'::jsonb;
end $$;
revoke all on function public.companion_v2_enroll(text,text,text,text),public.companion_v2_claim(text,uuid,uuid),public.companion_v2_record(uuid,uuid,timestamptz,timestamptz,jsonb,double precision,text,text) from public,anon,authenticated;
grant execute on function public.companion_v2_enroll(text,text,text,text),public.companion_v2_claim(text,uuid,uuid),public.companion_v2_record(uuid,uuid,timestamptz,timestamptz,jsonb,double precision,text,text) to service_role;
commit;
