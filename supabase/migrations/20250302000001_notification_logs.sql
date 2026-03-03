-- Notification logs: audit trail for emails and SMS sent by agents
create table if not exists notification_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  call_id text,                           -- VAPI call ID (nullable for manual sends)
  assistant_id text,                      -- VAPI assistant ID
  channel text not null check (channel in ('sms', 'email')),
  recipient text not null,                -- phone number or email address
  subject text,                           -- email subject (null for SMS)
  body text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  provider_response jsonb,                -- raw response from Twilio / email provider
  created_at timestamptz default now() not null
);

-- Index for listing user's notification history
create index if not exists idx_notification_logs_user on notification_logs (user_id, created_at desc);

-- RLS
alter table notification_logs enable row level security;

create policy "Users can read own notification logs"
  on notification_logs for select
  using (auth.uid() = user_id);

create policy "Users can insert own notification logs"
  on notification_logs for insert
  with check (auth.uid() = user_id);
