begin;
create table public.companion_commands (
 id uuid primary key default gen_random_uuid(), family_id uuid not null references public.families(id) on delete cascade,
 child_id uuid not null references public.profiles(id) on delete cascade, client_id uuid not null references public.companion_clients(id) on delete cascade,
 kind text not null check(kind in('diagnostics','check-update','test-countdown','apply-update')),
 status text not null default 'queued' check(status in('queued','running','completed','failed','expired')),
 request_id uuid not null, created_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '10 minutes',
 started_at timestamptz, completed_at timestamptz, result jsonb,
 unique(family_id,request_id),check(result is null or (jsonb_typeof(result)='object' and octet_length(result::text)<=4096))
);
create index companion_commands_device on public.companion_commands(client_id,created_at desc);
alter table public.companion_commands enable row level security;
revoke all on public.companion_commands from public,anon,authenticated;
grant select,insert,update,delete on public.companion_commands to service_role;

create function public.companion_queue_command(p_family uuid,p_actor uuid,p_client uuid,p_kind text,p_request uuid) returns uuid
language plpgsql security invoker set search_path=public,pg_temp as $$
declare c companion_clients; existing companion_commands; command_id uuid;
begin
 select * into c from companion_clients where id=p_client and family_id=p_family and revoked_at is null;
 if not found then raise exception 'PC not found' using errcode='P0002';end if;
 perform family_scope(p_family,c.child_id,p_actor,true);
 if p_kind is null or p_kind not in('diagnostics','check-update','test-countdown','apply-update') or p_request is null then raise exception 'Unsupported command' using errcode='22023';end if;
 select * into existing from companion_commands where family_id=p_family and request_id=p_request;
 if found then
  if existing.client_id=p_client and existing.kind=p_kind then return existing.id;end if;
  raise exception 'Command retry conflicts' using errcode='40001';
 end if;
 update companion_commands set status='expired',completed_at=now() where client_id=p_client and status in('queued','running') and expires_at<=now();
 if exists(select 1 from companion_commands where client_id=p_client and kind=p_kind and status in('queued','running')) then raise exception 'This command is already pending' using errcode='40001';end if;
 if (select count(*) from companion_commands where client_id=p_client and created_at>now()-interval '1 hour')>=30 then raise exception 'Too many maintenance requests' using errcode='22023';end if;
 insert into companion_commands(family_id,child_id,client_id,kind,request_id,created_by) values(p_family,c.child_id,p_client,p_kind,p_request,p_actor) returning id into command_id;
 return command_id;
end $$;
create function public.companion_next_command(p_client uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare c companion_commands;
begin
 perform 1 from companion_clients where id=p_client and revoked_at is null for update;
 if not found then raise exception 'PC unlinked' using errcode='42501';end if;
 update companion_commands set status='expired',completed_at=now() where client_id=p_client and status in('queued','running') and expires_at<=now();
 select * into c from companion_commands where client_id=p_client and status in('running','queued') order by (status='running') desc,created_at,id limit 1 for update;
 if not found then return null;end if;
 if c.status='queued' then update companion_commands set status='running',started_at=now() where id=c.id;end if;
 return jsonb_build_object('id',c.id,'kind',c.kind,'expiresAt',c.expires_at);
end $$;
create function public.companion_finish_command(p_client uuid,p_id uuid,p_status text,p_result jsonb) returns void
language plpgsql security invoker set search_path=public,pg_temp as $$
declare c companion_commands;
begin
 perform 1 from companion_clients where id=p_client and revoked_at is null for update;
 if not found then raise exception 'PC unlinked' using errcode='42501';end if;
 if p_status is null or p_status not in('completed','failed') or p_result is null or jsonb_typeof(p_result)<>'object' or octet_length(p_result::text)>4096 then raise exception 'Invalid result' using errcode='22023';end if;
 select * into c from companion_commands where id=p_id and client_id=p_client for update;
 if not found then raise exception 'Command not found' using errcode='P0002';end if;
 if c.status in('completed','failed') and c.status=p_status and c.result=p_result then return;end if;
 if c.status<>'running' or c.expires_at<=now() then raise exception 'Command is no longer running' using errcode='40001';end if;
 update companion_commands set status=p_status,result=p_result,completed_at=now() where id=p_id;
end $$;
revoke all on function public.companion_queue_command(uuid,uuid,uuid,text,uuid),public.companion_next_command(uuid),public.companion_finish_command(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.companion_queue_command(uuid,uuid,uuid,text,uuid),public.companion_next_command(uuid),public.companion_finish_command(uuid,uuid,text,jsonb) to service_role;
commit;
