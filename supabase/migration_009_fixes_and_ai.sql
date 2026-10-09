-- SmartBRGY migration 009: missing service functions, security hardening, and
-- AI assistant usage limits.
--
-- Safe to run more than once on an existing project. It does not delete data.
-- Functions that may already exist in your live database
-- (create_document_request_batch, create_helpdesk_ticket) are only created when
-- they are missing, so working live versions are never replaced.

------------------------------------------------------------------------------
-- 1. Columns the app depends on (for projects that skipped migration_008).
------------------------------------------------------------------------------
alter table public.profiles
  add column if not exists id_front_path text,
  add column if not exists id_back_path text,
  add column if not exists is_banned boolean not null default false,
  add column if not exists ban_reason text,
  add column if not exists banned_at timestamptz;

------------------------------------------------------------------------------
-- 2. Residents may only edit their own personal details, not verification,
--    ban, email or role columns.
------------------------------------------------------------------------------
create or replace function public.protect_resident_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if new.id_front_path is distinct from old.id_front_path
     or new.id_back_path is distinct from old.id_back_path
     or new.is_banned is distinct from old.is_banned
     or new.ban_reason is distinct from old.ban_reason
     or new.banned_at is distinct from old.banned_at
     or new.email is distinct from old.email
     or new.role is distinct from old.role then
    raise exception 'Residents may only update their personal details';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_resident_profile_update_trigger on public.profiles;
create trigger protect_resident_profile_update_trigger
before update on public.profiles
for each row execute function public.protect_resident_profile_update();

------------------------------------------------------------------------------
-- 3. Help Desk messages: residents may only mark barangay replies as read.
--    They can no longer edit message text (including admin replies).
------------------------------------------------------------------------------
create or replace function public.protect_helpdesk_message_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if (to_jsonb(new) - array['is_read', 'read_at'])
     is distinct from
     (to_jsonb(old) - array['is_read', 'read_at']) then
    raise exception 'Messages cannot be edited after sending';
  end if;

  if old.sender_role <> 'admin' then
    raise exception 'Only barangay replies can be marked as read';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_helpdesk_message_update_trigger on public.concern_messages;
create trigger protect_helpdesk_message_update_trigger
before update on public.concern_messages
for each row execute function public.protect_helpdesk_message_update();

drop policy if exists "Participants mark helpdesk messages read" on public.concern_messages;
create policy "Participants mark helpdesk messages read"
on public.concern_messages for update to authenticated
using (
  public.is_admin()
  or exists (select 1 from public.concerns where concerns.id = concern_messages.concern_id and concerns.resident_id = auth.uid())
)
with check (
  public.is_admin()
  or exists (select 1 from public.concerns where concerns.id = concern_messages.concern_id and concerns.resident_id = auth.uid())
);

------------------------------------------------------------------------------
-- 4. New records created by residents always start in a resident-safe state.
--    Admin-only fields (status, notes, schedules, respondents) are reset.
------------------------------------------------------------------------------
create or replace function public.reset_resident_document_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  new.resident_id := auth.uid();
  new.status := 'pending';
  new.admin_note := null;
  new.claim_schedule := null;
  new.claimed_at := null;
  new.claimed_by := null;
  new.claimed_by_role := null;
  return new;
end;
$$;

drop trigger if exists reset_resident_document_request_trigger on public.document_requests;
create trigger reset_resident_document_request_trigger
before insert on public.document_requests
for each row execute function public.reset_resident_document_request();

create or replace function public.reset_resident_incident_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  new.resident_id := auth.uid();
  new.status := 'pending';
  new.admin_note := null;
  new.respondent_id := null;
  new.scheduled_meeting_date := null;
  new.scheduled_meeting_time := null;
  new.meeting_venue := null;
  new.assigned_official := null;
  return new;
end;
$$;

drop trigger if exists reset_resident_incident_report_trigger on public.incident_reports;
create trigger reset_resident_incident_report_trigger
before insert on public.incident_reports
for each row execute function public.reset_resident_incident_report();

create or replace function public.reset_resident_concern()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  new.resident_id := auth.uid();
  if new.status::text not in ('pending', 'open') then
    new.status := 'pending';
  end if;
  new.admin_note := null;
  new.assigned_to := null;
  return new;
end;
$$;

drop trigger if exists reset_resident_concern_trigger on public.concerns;
create trigger reset_resident_concern_trigger
before insert on public.concerns
for each row execute function public.reset_resident_concern();

-- Attachment records must belong to the resident's own request.
drop policy if exists "Residents manage their own request attachments" on public.request_attachments;
create policy "Residents manage their own request attachments"
on public.request_attachments for all to authenticated
using (resident_id = auth.uid() or public.is_admin())
with check (
  public.is_admin()
  or (
    resident_id = auth.uid()
    and exists (
      select 1 from public.document_requests
      where document_requests.id = request_attachments.request_id
        and document_requests.resident_id = auth.uid()
    )
  )
);

------------------------------------------------------------------------------
-- 5. Shared phones: one device token belongs to one account at a time.
------------------------------------------------------------------------------
create or replace function public.claim_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or coalesce(trim(p_token), '') = '' then
    return;
  end if;
  update public.push_tokens
  set is_enabled = false, last_seen_at = now()
  where expo_push_token = p_token
    and user_id <> auth.uid()
    and is_enabled = true;
end;
$$;

revoke all on function public.claim_push_token(text) from public;
grant execute on function public.claim_push_token(text) to authenticated;

------------------------------------------------------------------------------
-- 6. Residents can delete their own replaced profile photos.
------------------------------------------------------------------------------
drop policy if exists "Residents delete their own profile images" on storage.objects;
create policy "Residents delete their own profile images"
on storage.objects for delete to authenticated
using (bucket_id = 'profile-images' and (storage.foldername(name))[1] = auth.uid()::text);

------------------------------------------------------------------------------
-- 7. Service functions the mobile app calls. Created only if missing.
------------------------------------------------------------------------------
do $outer$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_document_request_batch'
  ) then
    execute $fn$
      create function public.create_document_request_batch(
        requests_input jsonb,
        claim_method_input text default 'self',
        valid_id_path_input text default null,
        authorization_letter_path_input text default null
      )
      returns setof public.document_requests
      language plpgsql
      security definer
      set search_path = public
      as $body$
      declare
        item jsonb;
        new_row public.document_requests%rowtype;
        purpose_value text;
        copies_value integer;
        owner_prefix text;
      begin
        if auth.uid() is null then
          raise exception 'You must be logged in.';
        end if;
        if jsonb_typeof(requests_input) <> 'array'
           or jsonb_array_length(requests_input) < 1
           or jsonb_array_length(requests_input) > 10 then
          raise exception 'Select between 1 and 10 documents.';
        end if;
        if claim_method_input not in ('self', 'representative') then
          raise exception 'Invalid claim method.';
        end if;

        owner_prefix := auth.uid()::text || '/';
        if claim_method_input = 'representative' and (
             valid_id_path_input is null or authorization_letter_path_input is null
             or left(valid_id_path_input, length(owner_prefix)) <> owner_prefix
             or left(authorization_letter_path_input, length(owner_prefix)) <> owner_prefix
           ) then
          raise exception 'Representative claims require the valid ID and authorization letter.';
        end if;

        for item in select * from jsonb_array_elements(requests_input) loop
          purpose_value := trim(coalesce(item ->> 'purpose', ''));
          copies_value := coalesce((item ->> 'copies')::integer, 1);
          if char_length(purpose_value) < 2 or char_length(purpose_value) > 200 then
            raise exception 'Each document needs a purpose (2 to 200 characters).';
          end if;
          if copies_value < 1 or copies_value > 20 then
            raise exception 'Copies must be between 1 and 20.';
          end if;

          insert into public.document_requests (resident_id, document_type_id, purpose, copies, claim_method, status)
          values (auth.uid(), (item ->> 'document_type_id')::uuid, purpose_value, copies_value, claim_method_input, 'pending')
          returning * into new_row;

          if claim_method_input = 'representative' then
            insert into public.request_attachments (request_id, resident_id, attachment_type, storage_path)
            values
              (new_row.id, auth.uid(), 'valid_id', valid_id_path_input),
              (new_row.id, auth.uid(), 'authorization_letter', authorization_letter_path_input);
          end if;

          return next new_row;
        end loop;
        return;
      end;
      $body$;
    $fn$;
    execute 'revoke all on function public.create_document_request_batch(jsonb, text, text, text) from public';
    execute 'grant execute on function public.create_document_request_batch(jsonb, text, text, text) to authenticated';
  end if;

  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_helpdesk_ticket'
  ) then
    execute $fn$
      create function public.create_helpdesk_ticket(
        category_input text,
        area_input text,
        landmark_input text,
        details_input text
      )
      returns setof public.concerns
      language plpgsql
      security definer
      set search_path = public
      as $body$
      declare
        new_ticket public.concerns%rowtype;
        number_value text;
      begin
        if auth.uid() is null then
          raise exception 'You must be logged in.';
        end if;
        if char_length(trim(coalesce(category_input, ''))) < 2
           or char_length(trim(coalesce(area_input, ''))) < 2
           or char_length(trim(coalesce(landmark_input, ''))) not between 2 and 200
           or char_length(trim(coalesce(details_input, ''))) not between 2 and 2000 then
          raise exception 'Complete the category, area, location, and concern details.';
        end if;

        loop
          number_value := 'HD-' || to_char(now(), 'YYYY') || '-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
          exit when not exists (select 1 from public.concerns where ticket_number = number_value);
        end loop;

        insert into public.concerns (resident_id, subject, details, category, area, landmark, ticket_number, status)
        values (auth.uid(), trim(category_input), trim(details_input), trim(category_input), trim(area_input), trim(landmark_input), number_value, 'open')
        returning * into new_ticket;

        insert into public.concern_messages (concern_id, sender_id, sender_role, message)
        values (new_ticket.id, auth.uid(), 'resident', trim(details_input));

        return next new_ticket;
        return;
      end;
      $body$;
    $fn$;
    execute 'revoke all on function public.create_helpdesk_ticket(text, text, text, text) from public';
    execute 'grant execute on function public.create_helpdesk_ticket(text, text, text, text) to authenticated';
  end if;
end;
$outer$;

------------------------------------------------------------------------------
-- 8. AI assistant: daily usage limit per resident.
--    Only the ai-assistant Edge Function (service role) reads or writes this.
------------------------------------------------------------------------------
create table if not exists public.ai_usage (
  user_id uuid not null references public.profiles(id) on delete cascade,
  usage_date date not null default (now() at time zone 'Asia/Manila')::date,
  request_count integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, usage_date)
);

alter table public.ai_usage enable row level security;
-- No policies on purpose: residents cannot read or change their counters.

create or replace function public.ai_consume_quota(p_user_id uuid, p_daily_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := (now() at time zone 'Asia/Manila')::date;
  current_count integer;
begin
  insert into public.ai_usage (user_id, usage_date, request_count, updated_at)
  values (p_user_id, today, 1, now())
  on conflict (user_id, usage_date)
  do update set request_count = public.ai_usage.request_count + 1, updated_at = now()
  returning request_count into current_count;

  return current_count <= p_daily_limit;
end;
$$;

revoke all on function public.ai_consume_quota(uuid, integer) from public;
revoke all on function public.ai_consume_quota(uuid, integer) from anon, authenticated;
grant execute on function public.ai_consume_quota(uuid, integer) to service_role;
