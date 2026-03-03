-- API keys table: one user can have multiple API keys
create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  key_hash text not null,           -- SHA-256 hash of the full key
  key_prefix text not null,         -- first 8 chars for display (e.g. "eb_1a2b...")
  name text not null default 'Default',
  created_at timestamptz default now() not null,
  last_used_at timestamptz,
  revoked boolean default false not null
);

-- Index for fast lookup by hash (used on every authenticated request)
create index if not exists idx_api_keys_hash on api_keys (key_hash) where revoked = false;

-- RLS: users can only manage their own keys
alter table api_keys enable row level security;

create policy "Users can read own api keys"
  on api_keys for select
  using (auth.uid() = user_id);

create policy "Users can insert own api keys"
  on api_keys for insert
  with check (auth.uid() = user_id);

create policy "Users can update own api keys"
  on api_keys for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
