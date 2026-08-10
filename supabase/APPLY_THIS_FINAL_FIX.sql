-- SmartBRGY existing-project repair (safe to run more than once).
-- This does not replace the project and does not remove or reset existing data.

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  expo_push_token text not null,
  platform text not null check (platform in ('android', 'ios')),
  device_name text,
  is_enabled boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (user_id, expo_push_token)
);

create index if not exists push_tokens_enabled_user_idx
on public.push_tokens(user_id) where is_enabled = true;

alter table public.push_tokens enable row level security;

drop policy if exists "Residents manage own push tokens" on public.push_tokens;
create policy "Residents manage own push tokens"
on public.push_tokens for all to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Admins view push tokens" on public.push_tokens;
create policy "Admins view push tokens"
on public.push_tokens for select to authenticated
using (public.is_admin());

grant select, insert, update, delete on public.push_tokens to authenticated;

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception when duplicate_object then null;
end $$;

-- Every mobile/admin screen listens to the same database records. Adding all
-- service tables to the realtime publication removes manual-refresh gaps.
do $$ begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.document_requests;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.document_types;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.request_attachments;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.incident_reports;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.concerns;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.concern_messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.announcements;
exception when duplicate_object then null; end $$;
