-- Supabase ED dashboard schema (stage 1)
create table if not exists ed_dash_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  state_json jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table ed_dash_settings enable row level security;

create policy "Users can manage their state" on ed_dash_settings
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists idx_ed_dash_settings_user_id on ed_dash_settings(user_id);
