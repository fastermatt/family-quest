-- Optional link a chore opens (e.g. Grey's lesson apps).
alter table task_templates add column if not exists link_url text;
