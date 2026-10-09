-- 003: proof types, required chores, cutoff times, 'missed' status
-- Additive: safe to run against a database that is already serving the app.

alter table task_templates
  add column if not exists proof_type text not null default 'check'
    check (proof_type in ('photo', 'imessage_video', 'check')),
  add column if not exists required boolean not null default true,
  add column if not exists cutoff_time time;

-- Existing photo_required flag becomes the proof type.
update task_templates
set proof_type = case when photo_required then 'photo' else 'check' end;

-- Allow a chore that was never done to be closed out as 'missed'.
alter table task_instances drop constraint if exists task_instances_status_check;
alter table task_instances
  add constraint task_instances_status_check
  check (status in ('pending', 'submitted', 'approved', 'rejected', 'missed'));

-- Close out stale pending chores left over from before generation stopped.
update task_instances
set status = 'missed'
where status = 'pending' and due_date < current_date;
