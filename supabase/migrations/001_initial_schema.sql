-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Families table
create table families (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  family_xp integer default 0,
  family_level integer default 1,
  created_at timestamptz default now()
);

-- Profiles table
create table profiles (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references families(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  name text not null,
  role text not null check (role in ('parent','child')),
  avatar_emoji text default '🦁',
  xp_total integer default 0,
  current_level integer default 1,
  current_streak integer default 0,
  longest_streak integer default 0,
  created_at timestamptz default now()
);

-- Task templates table
create table task_templates (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references families(id) on delete cascade,
  name text not null,
  category text default 'general',
  recurrence_type text not null check (recurrence_type in ('daily','weekdays','weekly','monthly','once')),
  recurrence_days integer[] default '{}',
  reset_hour integer default 0,
  photo_required boolean default false,
  xp_value integer default 100,
  difficulty_stars integer default 1 check (difficulty_stars between 1 and 5),
  active boolean default true,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- Task assignments table
create table task_assignments (
  id uuid primary key default uuid_generate_v4(),
  template_id uuid references task_templates(id) on delete cascade,
  assigned_to uuid references profiles(id) on delete cascade,
  unique(template_id, assigned_to)
);

-- Task instances table (daily generated)
create table task_instances (
  id uuid primary key default uuid_generate_v4(),
  template_id uuid references task_templates(id) on delete cascade,
  assigned_to uuid references profiles(id) on delete cascade,
  due_date date not null,
  status text default 'pending' check (status in ('pending','submitted','approved','rejected')),
  photo_url text,
  photo_challenge_prompt text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  review_note text,
  xp_awarded integer default 0,
  created_at timestamptz default now(),
  unique(template_id, assigned_to, due_date)
);

-- Photo challenges library
create table photo_challenges (
  id uuid primary key default uuid_generate_v4(),
  category text not null,
  prompt_text text not null,
  emoji text default '📸'
);

-- Privileges table
create table privileges (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references families(id) on delete cascade,
  name text not null,
  description text default '',
  gating_mode text default 'all_tasks' check (gating_mode in ('all_tasks','specific_tasks','always_available')),
  required_template_ids uuid[] default '{}',
  visible_to uuid[] default '{}',
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- Privilege requests table
create table privilege_requests (
  id uuid primary key default uuid_generate_v4(),
  privilege_id uuid references privileges(id) on delete cascade,
  requested_by uuid references profiles(id) on delete cascade,
  status text default 'pending' check (status in ('pending','approved','denied','conditional')),
  response_note text,
  time_limit_minutes integer,
  created_at timestamptz default now(),
  responded_at timestamptz
);

-- Bonus tasks table
create table bonus_tasks (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references families(id) on delete cascade,
  name text not null,
  description text default '',
  type text default 'open_bounty' check (type in ('open_bounty','assigned')),
  assigned_to uuid references profiles(id),
  reward_type text not null check (reward_type in ('money','experience','privilege','item','xp')),
  reward_value text default '',
  reward_description text default '',
  xp_bonus integer default 500,
  status text default 'active' check (status in ('active','claimed','completed','expired')),
  claimed_by uuid references profiles(id),
  deadline timestamptz,
  photo_required boolean default true,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- Bonus task instances table
create table bonus_task_instances (
  id uuid primary key default uuid_generate_v4(),
  bonus_task_id uuid references bonus_tasks(id) on delete cascade,
  claimed_by uuid references profiles(id) on delete cascade,
  status text default 'claimed' check (status in ('claimed','submitted','approved','rejected')),
  photo_url text,
  photo_challenge_prompt text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  review_note text
);

-- Weekly standings table
create table weekly_standings (
  id uuid primary key default uuid_generate_v4(),
  family_id uuid references families(id) on delete cascade,
  profile_id uuid references profiles(id) on delete cascade,
  week_start date not null,
  xp_earned integer default 0,
  tasks_completed integer default 0,
  bonus_tasks_completed integer default 0,
  streak_peak integer default 0,
  titles_earned text[] default '{}',
  created_at timestamptz default now(),
  unique(profile_id, week_start)
);

-- Push subscriptions table
create table push_subscriptions (
  id uuid primary key default uuid_generate_v4(),
  profile_id uuid references profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz default now()
);

-- Enable Row Level Security
alter table families enable row level security;
alter table profiles enable row level security;
alter table task_templates enable row level security;
alter table task_assignments enable row level security;
alter table task_instances enable row level security;
alter table photo_challenges enable row level security;
alter table privileges enable row level security;
alter table privilege_requests enable row level security;
alter table bonus_tasks enable row level security;
alter table bonus_task_instances enable row level security;
alter table weekly_standings enable row level security;
alter table push_subscriptions enable row level security;

-- Create helper function to get family_id
create or replace function get_my_family_id() returns uuid as $$
  select family_id from profiles where auth_user_id = auth.uid() limit 1;
$$ language sql security definer;

-- RLS Policies for families
create policy "family_select" on families for select using (id = get_my_family_id());
create policy "family_insert" on families for insert with check (true);
create policy "family_update" on families for update using (id = get_my_family_id());

-- RLS Policies for profiles
create policy "profiles_select" on profiles for select using (family_id = get_my_family_id());
create policy "profiles_insert" on profiles for insert with check (true);
create policy "profiles_update" on profiles for update using (family_id = get_my_family_id());

-- RLS Policies for task_templates
create policy "templates_all" on task_templates for all using (family_id = get_my_family_id());

-- RLS Policies for task_assignments
create policy "assignments_all" on task_assignments for all using (
  template_id in (select id from task_templates where family_id = get_my_family_id())
);

-- RLS Policies for task_instances
create policy "instances_all" on task_instances for all using (
  template_id in (select id from task_templates where family_id = get_my_family_id())
);

-- RLS Policies for photo_challenges
create policy "challenges_read" on photo_challenges for select using (true);

-- RLS Policies for privileges
create policy "privileges_all" on privileges for all using (family_id = get_my_family_id());

-- RLS Policies for privilege_requests
create policy "requests_all" on privilege_requests for all using (
  privilege_id in (select id from privileges where family_id = get_my_family_id())
);

-- RLS Policies for bonus_tasks
create policy "bonus_all" on bonus_tasks for all using (family_id = get_my_family_id());
create policy "bonus_instances_all" on bonus_task_instances for all using (
  bonus_task_id in (select id from bonus_tasks where family_id = get_my_family_id())
);

-- RLS Policies for weekly_standings
create policy "standings_all" on weekly_standings for all using (family_id = get_my_family_id());

-- RLS Policies for push_subscriptions
create policy "push_all" on push_subscriptions for all using (
  profile_id in (select id from profiles where family_id = get_my_family_id())
);

-- Seed photo challenges
insert into photo_challenges (category, prompt_text, emoji) values
('kitchen', 'Take a selfie with a big thumbs up in front of the clean sink', '👍'),
('kitchen', 'Your left foot must be in the photo', '🦶'),
('kitchen', 'Hold a spoon in the photo', '🥄'),
('kitchen', 'Show the clean counter and make a peace sign', '✌️'),
('kitchen', 'Point at your best work with both hands', '👐'),
('bedroom', 'Take a selfie lying on your made bed', '🛏️'),
('bedroom', 'Show your shoes lined up and flex your muscles', '💪'),
('bedroom', 'Hold your pillow while smiling', '😊'),
('bedroom', 'Point both thumbs at the tidy room behind you', '👍'),
('pet_care', 'Selfie with the dog on the leash', '🐕'),
('pet_care', 'Show both you and the dog in the same photo', '🤳'),
('pet_care', 'Get the dog to look at the camera', '📸'),
('outdoor', 'Show your dirty hands as proof of work', '🙌'),
('outdoor', 'Selfie with what you cleaned behind you', '🤳'),
('outdoor', 'Hold the tool you used', '🛠️'),
('laundry', 'Selfie next to the folded pile', '👕'),
('laundry', 'Balance one folded item on your head', '🎩'),
('laundry', 'Hold a matching pair of socks', '🧦'),
('schoolwork', 'Take a photo of your completed work', '📝'),
('schoolwork', 'Selfie with your notes and a thumbs up', '📚'),
('general', 'Make your silliest face', '😜'),
('general', 'Double thumbs up', '👍'),
('general', 'Superhero pose', '🦸'),
('general', 'Show exactly five fingers', '✋'),
('general', 'Hold anything orange in the photo', '🍊'),
('general', 'Strike a victory pose', '🏆'),
('general', 'Flex your muscles', '💪'),
('general', 'Take a selfie with a smile', '😁');
