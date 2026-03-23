-- Add time_of_day column to task_templates
alter table task_templates
  add column if not exists time_of_day text default 'anytime'
  check (time_of_day in ('anytime', 'morning', 'afternoon', 'evening'));
