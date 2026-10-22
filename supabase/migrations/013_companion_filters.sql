-- Windows companion v0.1: parent-managed web filters (family-wide).
-- NOT APPLIED. Review, then run by hand against the test project first.
-- Device pairing, policy sync and event tables come in v0.2.

-- Parent rules. Domain rules cover subdomains. 'school' is always allowed.
create table if not exists public.companion_rules (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  kind text not null check (kind in ('school', 'allow', 'deny')),
  domain text not null check (domain = lower(domain) and position('.' in domain) > 0 and length(domain) <= 253),
  note text not null default '',
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (family_id, kind, domain)
);
create index if not exists companion_rules_family_idx on public.companion_rules(family_id);
alter table public.companion_rules enable row level security;

-- Category switches. No row = the catalog default (see src/lib/companion/categories.ts).
create table if not exists public.companion_categories (
  family_id uuid not null references families(id) on delete cascade,
  category_id text not null,
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  primary key (family_id, category_id)
);
alter table public.companion_categories enable row level security;
