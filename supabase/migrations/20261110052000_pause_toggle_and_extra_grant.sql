-- Parent pause toggle and extra daily grant.
begin;

-- Extend kind to include 'extra' (parent-granted bonus minutes, one per day, any day).
alter table public.family_game_grants
  drop constraint if exists family_game_grants_kind_check;
alter table public.family_game_grants
  add constraint family_game_grants_kind_check
  check (kind in ('daily', 'bathroom', 'extra'));

alter table public.family_game_grants
  drop constraint if exists family_game_grants_check;
alter table public.family_game_grants
  add constraint family_game_grants_check check (
    (kind = 'bathroom' and weekend_start is not null
     and extract(dow from weekend_start) = 6
     and day between weekend_start and weekend_start + 1)
    or (kind = 'daily'   and weekend_start is null)
    or (kind = 'extra'   and weekend_start is null)
  );

-- Grant or update today's extra minutes (0 removes the grant).
create function public.family_extra_grant(
  p_family uuid, p_child uuid, p_actor uuid,
  p_minutes integer, p_note text
) returns void language plpgsql security invoker
set search_path = public, pg_temp as $$
declare s family_control_settings; d date;
begin
  perform family_scope(p_family, p_child, p_actor, true);
  select * into s from family_control_settings
    where child_id = p_child and family_id = p_family;
  if not coalesce(s.enabled, false) then
    raise exception 'Enable family game rules before granting extra time'
      using errcode = '22023';
  end if;
  if p_minutes is null or p_minutes < 0 or p_minutes > 240 then
    raise exception 'Extra minutes must be between 0 and 240'
      using errcode = '22023';
  end if;
  if p_minutes > 0 and (p_note is null or length(trim(p_note)) < 1 or length(p_note) > 200) then
    raise exception 'Enter a reason for the extra time (200 characters max)'
      using errcode = '22023';
  end if;
  d := (now() at time zone coalesce(s.timezone, 'America/Denver'))::date;
  if p_minutes = 0 then
    delete from family_game_grants
      where family_id = p_family and child_id = p_child and day = d and kind = 'extra';
  else
    insert into family_game_grants(family_id, child_id, day, kind, seconds, note, created_by)
    values (p_family, p_child, d, 'extra', p_minutes * 60, trim(p_note), p_actor)
    on conflict (child_id, day, kind) do update
      set seconds = excluded.seconds,
          note    = excluded.note,
          created_by = excluded.created_by;
  end if;
end $$;

-- Parent pause/unpause games on the linked PC (takes effect on next PC check-in, ≤15 min).
create function public.family_set_paused(
  p_family uuid, p_child uuid, p_actor uuid, p_paused boolean
) returns void language plpgsql security invoker
set search_path = public, pg_temp as $$
begin
  perform family_scope(p_family, p_child, p_actor, true);
  insert into companion_limits(family_id, child_id, paused)
    values (p_family, p_child, p_paused)
  on conflict (family_id, child_id) do update
    set paused = excluded.paused;
end $$;

revoke all on function
  public.family_extra_grant(uuid, uuid, uuid, integer, text),
  public.family_set_paused(uuid, uuid, uuid, boolean)
from public, anon, authenticated;

grant execute on function
  public.family_extra_grant(uuid, uuid, uuid, integer, text),
  public.family_set_paused(uuid, uuid, uuid, boolean)
to service_role;

commit;
