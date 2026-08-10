-- Device token registry used by the send-push Edge Function.
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
