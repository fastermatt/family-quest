-- 003: proof types, required chores, cutoff times, 'missed' status, safe XP
-- Additive: safe to run against a database that is already serving the app.

alter table task_templates
  add column if not exists proof_type text not null default 'check'
    check (proof_type in ('photo', 'imessage_video', 'check')),
  add column if not exists required boolean not null default true,
  add column if not exists cutoff_time time;

-- Existing photo_required flag becomes the proof type.
update task_templates
set proof_type = case when photo_required then 'photo' else 'check' end;

-- Parents get the evening summary at this address.
alter table profiles add column if not exists email text;

-- Allow a chore that was never done to be closed out as 'missed'.
alter table task_instances drop constraint if exists task_instances_status_check;
alter table task_instances
  add constraint task_instances_status_check
  check (status in ('pending', 'submitted', 'approved', 'rejected', 'missed'));

-- Close out stale pending chores left over from before generation stopped.
-- Family time, not UTC: running this at 8pm in Denver must not touch today.
update task_instances
set status = 'missed'
where status = 'pending'
  and due_date < (now() at time zone 'America/Denver')::date;

-- Award points atomically so quick approvals cannot overwrite each other.
create or replace function public.award_xp(p_child uuid, p_family uuid, p_xp integer)
returns void
language sql
security definer
set search_path = public
as $$
  update profiles set xp_total = coalesce(xp_total, 0) + p_xp where id = p_child;
  update families
    set family_xp = coalesce(family_xp, 0) + p_xp,
        family_level = floor((coalesce(family_xp, 0) + p_xp) / 5000) + 1
    where id = p_family;
$$;

-- Only the server (service role) may call it.
revoke all on function public.award_xp(uuid, uuid, integer) from public, anon, authenticated;
