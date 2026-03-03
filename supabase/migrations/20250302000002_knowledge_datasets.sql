-- Knowledge datasets: dynamic datasets that can be attached to calls
create table if not exists knowledge_datasets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  description text,
  data jsonb not null default '[]'::jsonb,  -- the actual dataset (array of objects)
  created_at timestamptz default now() not null,
  updated_at timestamptz default now() not null
);

-- Index for listing user's datasets
create index if not exists idx_knowledge_datasets_user on knowledge_datasets (user_id, created_at desc);

-- RLS
alter table knowledge_datasets enable row level security;

create policy "Users can read own datasets"
  on knowledge_datasets for select
  using (auth.uid() = user_id);

create policy "Users can insert own datasets"
  on knowledge_datasets for insert
  with check (auth.uid() = user_id);

create policy "Users can update own datasets"
  on knowledge_datasets for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own datasets"
  on knowledge_datasets for delete
  using (auth.uid() = user_id);
