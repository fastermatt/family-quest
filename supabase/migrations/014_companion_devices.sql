-- Windows companion stage 1: pairing and device reports. NOT APPLIED.
-- Service-role only (RLS on, no policies), like the other companion tables.

create table if not exists public.companion_devices (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references families(id) on delete cascade,
  name text not null default 'Windows PC',
  token_hash text not null unique,        -- sha256 of the device token; the token itself is never stored here
  inventory jsonb not null default '{}'::jsonb,
  last_seen_at timestamptz,
  created_by uuid references profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index if not exists companion_devices_family_idx on public.companion_devices(family_id);
alter table public.companion_devices enable row level security;

-- One row per pairing attempt. Lives 10 minutes. pending_token is cleared the moment the PC collects it.
create table if not exists public.companion_pairings (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null,
  poll_hash text not null,
  device_name text not null default 'Windows PC',
  expires_at timestamptz not null,
  family_id uuid references families(id) on delete cascade,
  device_id uuid references companion_devices(id) on delete cascade,
  approved_by uuid references profiles(id) on delete set null,
  approved_at timestamptz,
  pending_token text,
  consumed boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists companion_pairings_code_idx on public.companion_pairings(code_hash) where family_id is null;
alter table public.companion_pairings enable row level security;
