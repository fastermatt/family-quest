-- Confirm the recipient is still a parent in the same family at delivery claim.
create or replace function public.companion_presence_claim() returns setof public.companion_presence_events language sql security definer set search_path=public,pg_temp as $$
 with picked as (
  select e.id from companion_presence_events e join companion_presence_settings s on s.child_id=e.child_id and s.family_id=e.family_id
  join companion_clients c on c.id=e.client_id and c.revoked_at is null
  join profiles p on p.id=e.notify_parent_id and p.family_id=e.family_id and p.role='parent'
  where s.enabled and e.push_attempted_at is null and e.occurred_at>=now()-interval '1 day'
  order by e.occurred_at limit 50 for update of e skip locked
 ) update companion_presence_events e set push_attempted_at=now() from picked where e.id=picked.id returning e.*;
$$;
revoke all on function public.companion_presence_claim() from public,anon,authenticated;
grant execute on function public.companion_presence_claim() to service_role;
