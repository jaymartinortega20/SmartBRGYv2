-- SmartBRGY Barangay Tubod Help Desk

alter type public.case_status add value if not exists 'open';
alter type public.case_status add value if not exists 'assigned';
alter type public.case_status add value if not exists 'waiting_for_resident';
alter type public.case_status add value if not exists 'closed';

alter table public.concerns
  add column if not exists ticket_number text,
  add column if not exists category text,
  add column if not exists area text,
  add column if not exists landmark text,
  add column if not exists assigned_to text,
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists concerns_ticket_number_key on public.concerns(ticket_number) where ticket_number is not null;

create table if not exists public.concern_messages (
  id uuid primary key default gen_random_uuid(),
  concern_id uuid not null references public.concerns(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  sender_role text not null check (sender_role in ('resident', 'admin', 'system')),
  message text not null check (char_length(trim(message)) between 1 and 2000),
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists concern_messages_ticket_date_idx on public.concern_messages(concern_id, created_at);
alter table public.concerns enable row level security;
alter table public.concern_messages enable row level security;

drop policy if exists "Residents view own helpdesk tickets" on public.concerns;
create policy "Residents view own helpdesk tickets" on public.concerns for select to authenticated using (resident_id = auth.uid() or public.is_admin());
drop policy if exists "Residents create helpdesk tickets" on public.concerns;
create policy "Residents create helpdesk tickets" on public.concerns for insert to authenticated with check (resident_id = auth.uid());
drop policy if exists "Residents update own helpdesk tickets" on public.concerns;
create policy "Residents update own helpdesk tickets" on public.concerns for update to authenticated using (resident_id = auth.uid() or public.is_admin()) with check (resident_id = auth.uid() or public.is_admin());

drop policy if exists "Participants view helpdesk messages" on public.concern_messages;
create policy "Participants view helpdesk messages" on public.concern_messages for select to authenticated using (
  public.is_admin() or exists (select 1 from public.concerns where concerns.id = concern_messages.concern_id and concerns.resident_id = auth.uid())
);
drop policy if exists "Participants send helpdesk messages" on public.concern_messages;
create policy "Participants send helpdesk messages" on public.concern_messages for insert to authenticated with check (
  sender_id = auth.uid() and (
    public.is_admin() or (sender_role = 'resident' and exists (select 1 from public.concerns where concerns.id = concern_messages.concern_id and concerns.resident_id = auth.uid()))
  )
);
drop policy if exists "Participants mark helpdesk messages read" on public.concern_messages;
create policy "Participants mark helpdesk messages read" on public.concern_messages for update to authenticated using (
  public.is_admin() or exists (select 1 from public.concerns where concerns.id = concern_messages.concern_id and concerns.resident_id = auth.uid())
);

create or replace function public.handle_helpdesk_message()
returns trigger language plpgsql security definer set search_path = public as $$
declare ticket public.concerns%rowtype;
begin
  select * into ticket from public.concerns where id = new.concern_id;
  update public.concerns set updated_at = now() where id = new.concern_id;
  if new.sender_role = 'admin' then
    insert into public.notifications(user_id, title, message, type, related_table, related_id, target_path)
    values (ticket.resident_id, 'New Barangay Help Desk reply', coalesce(ticket.ticket_number, 'Help Desk ticket'), 'concern', 'concerns', ticket.id, '/feedback?ticketId=' || ticket.id::text);
  end if;
  return new;
end;
$$;
drop trigger if exists helpdesk_message_activity on public.concern_messages;
create trigger helpdesk_message_activity after insert on public.concern_messages for each row execute function public.handle_helpdesk_message();

create or replace function public.notify_concern_status()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into public.notifications(user_id, title, message, type, related_table, related_id, target_path)
    values (new.resident_id, 'Help Desk status: ' || replace(new.status::text, '_', ' '), coalesce(new.ticket_number, 'Help Desk ticket'), 'concern', 'concerns', new.id, '/feedback?ticketId=' || new.id::text);
  end if;
  return new;
end;
$$;
drop trigger if exists concern_status_notification on public.concerns;
create trigger concern_status_notification after update on public.concerns for each row execute function public.notify_concern_status();

do $$ begin
  alter publication supabase_realtime add table public.concern_messages;
exception when duplicate_object then null;
end $$;
