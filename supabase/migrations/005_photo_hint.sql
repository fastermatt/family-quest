-- Per-chore photo instruction ("Your made bed: covers pulled up, pillows on top").
-- Replaces the random photo_challenges pool, which asked for things unrelated to the chore.
alter table task_templates add column if not exists photo_hint text;
