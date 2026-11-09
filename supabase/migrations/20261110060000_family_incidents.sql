-- Parent incident log: record misbehaviour with optional game block.
begin;

create table public.family_incidents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check(kind in('disobeyed','lied','talked-back','other')),
  note text not null check(length(trim(note)) between 1 and 500),
  consequence text not null default 'block_games' check(consequence in('block_games','none')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id),
  resolution_note text check(resolution_note is null or length(trim(resolution_note)) between 1 and 500)
);
create index family_incidents_child on public.family_incidents(family_id,child_id,created_at desc);

alter table public.family_incidents enable row level security;
revoke all on public.family_incidents from public,anon,authenticated;
grant select,insert,update,delete on public.family_incidents to service_role;

create function public.family_add_incident(
  p_family uuid, p_child uuid, p_actor uuid,
  p_kind text, p_note text, p_consequence text
) returns uuid language plpgsql security invoker
set search_path = public, pg_temp as $$
declare new_id uuid;
begin
  perform family_scope(p_family, p_child, p_actor, true);
  if p_kind not in('disobeyed','lied','talked-back','other') then
    raise exception 'Choose a valid incident kind' using errcode = '22023';
  end if;
  if p_note is null or length(trim(p_note)) < 1 or length(p_note) > 500 then
    raise exception 'Enter a note describing what happened (500 characters max)' using errcode = '22023';
  end if;
  if p_consequence not in('block_games','none') then
    raise exception 'Choose block_games or none' using errcode = '22023';
  end if;
  insert into family_incidents(family_id, child_id, kind, note, consequence, created_by)
  values (p_family, p_child, p_kind, trim(p_note), p_consequence, p_actor)
  returning id into new_id;
  return new_id;
end $$;

create function public.family_resolve_incident(
  p_family uuid, p_child uuid, p_actor uuid,
  p_id uuid, p_note text
) returns void language plpgsql security invoker
set search_path = public, pg_temp as $$
declare inc family_incidents;
begin
  perform family_scope(p_family, p_child, p_actor, true);
  select * into inc from family_incidents
    where id = p_id and family_id = p_family and child_id = p_child;
  if not found then
    raise exception 'Incident not found' using errcode = 'P0002';
  end if;
  if inc.resolved_at is not null then return; end if;
  if p_note is null or length(trim(p_note)) < 1 or length(p_note) > 500 then
    raise exception 'Enter a resolution note (500 characters max)' using errcode = '22023';
  end if;
  update family_incidents
    set resolved_at = now(), resolved_by = p_actor, resolution_note = trim(p_note)
  where id = p_id;
end $$;

revoke all on function
  public.family_add_incident(uuid, uuid, uuid, text, text, text),
  public.family_resolve_incident(uuid, uuid, uuid, uuid, text)
from public, anon, authenticated;

grant execute on function
  public.family_add_incident(uuid, uuid, uuid, text, text, text),
  public.family_resolve_incident(uuid, uuid, uuid, uuid, text)
to service_role;

commit;
