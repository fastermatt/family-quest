-- Written proof: the child answers the chore's questions (e.g. Bible: what did you read, what did you learn).
alter table task_templates drop constraint if exists task_templates_proof_type_check;
alter table task_templates add constraint task_templates_proof_type_check
  check (proof_type in ('photo', 'imessage_video', 'check', 'written'));
alter table task_templates add column if not exists questions text[];
alter table task_instances add column if not exists answers jsonb;
