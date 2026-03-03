-- OAuth tokens: store Google (and future) provider tokens per user
create table if not exists oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  provider text not null default 'google',
  access_token text,
  refresh_token text,
  expiry_date timestamptz,
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null,

  -- one row per provider per user
  unique (user_id, provider)
);

alter table oauth_tokens enable row level security;

-- Only the service role / admin can read/write tokens (never exposed to client)
-- No user-facing RLS policies needed — all access goes through supabase-admin.ts
create policy "Service role full access on oauth_tokens"
  on oauth_tokens for all
  using (true)
  with check (true);
