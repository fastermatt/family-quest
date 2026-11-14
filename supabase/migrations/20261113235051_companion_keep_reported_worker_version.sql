create or replace function public.companion_v2_record(p_client uuid,p_batch uuid,p_start timestamptz,p_end timestamptz,p_apps jsonb,p_gaps double precision,p_version text,p_hash text) returns jsonb
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
 -- A batch can have been collected by a different worker version. Leave
 -- the installed-version report to the authenticated state request.
 update companion_clients set last_seen_at=greatest(last_seen_at,clock_timestamp()) where id=c.id;
 delete from companion_activity where client_id=c.id and period_end<now()-interval '14 days';
 return '{}'::jsonb;
end $$;
