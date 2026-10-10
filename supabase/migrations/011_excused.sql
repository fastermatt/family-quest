-- Parents can excuse a chore (counts as done for rewards and streaks).
alter table task_instances drop constraint if exists task_instances_status_check;
alter table task_instances add constraint task_instances_status_check
  check (status in ('pending', 'submitted', 'approved', 'rejected', 'missed', 'excused'));
