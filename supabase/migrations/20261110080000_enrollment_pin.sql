-- 4-digit PIN for quick PC linking.
begin;

alter table public.companion_enrollments
  add column pin_hash text check(pin_hash is null or pin_hash ~ '^[a-f0-9]{64}$');

create unique index companion_enrollments_pin
  on public.companion_enrollments(pin_hash)
  where pin_hash is not null and client_id is null;

-- Claim an enrollment by PIN hash. Rate-limiting is handled at the API layer.
create function public.companion_v2_claim_by_pin(
  p_pin_hash text, p_family uuid, p_child uuid
) returns jsonb language plpgsql security invoker
set search_path = public, pg_temp as $$
declare e companion_enrollments; c uuid;
begin
  if p_pin_hash !~ '^[a-f0-9]{64}$' then return jsonb_build_object('error','Invalid PIN.');end if;
  if not exists(select 1 from profiles where id=p_child and family_id=p_family and role='child') then return jsonb_build_object('error','Child not found.');end if;
  select * into e from companion_enrollments
    where pin_hash=p_pin_hash and expires_at>now() for update;
  if not found then return jsonb_build_object('error','Code expired or not found.');end if;
  if e.client_id is not null then
    if exists(select 1 from companion_clients where id=e.client_id and family_id=p_family and child_id=p_child) then return jsonb_build_object('clientId',e.client_id);end if;
    return jsonb_build_object('error','Code already used.');
  end if;
  if exists(select 1 from companion_clients where family_id=p_family and child_id=p_child and account_tag=e.account_tag and revoked_at is null) then return jsonb_build_object('error','This Windows account is already linked. Unlink the old PC entry first.');end if;
  insert into companion_clients(family_id,child_id,token_hash,account_tag,name) values(p_family,p_child,e.token_hash,e.account_tag,e.name) returning id into c;
  update companion_enrollments set client_id=c where pin_hash=p_pin_hash;
  return jsonb_build_object('clientId',c);
end $$;

revoke all on function public.companion_v2_claim_by_pin(text,uuid,uuid) from public,anon,authenticated;
grant execute on function public.companion_v2_claim_by_pin(text,uuid,uuid) to service_role;

commit;
