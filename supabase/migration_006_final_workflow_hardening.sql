-- Final SmartBRGY service catalogue, attachments, announcement 5 W's, and RLS hardening.

alter table public.announcements
  add column if not exists target_audience text,
  add column if not exists purpose text,
  add column if not exists end_time time,
  add column if not exists contact_number text,
  add column if not exists priority text not null default 'normal';

alter table public.announcements drop constraint if exists announcements_priority_check;
alter table public.announcements add constraint announcements_priority_check
  check (priority in ('normal', 'important', 'emergency'));

update public.announcements
set
  target_audience = coalesce(target_audience, 'All Barangay Tubod residents'),
  purpose = coalesce(purpose, 'Official barangay information and public awareness')
where target_audience is null or purpose is null;

insert into public.document_types (name, fee, requirements, instructions)
values
  ('Barangay Clearance', 50, 'Valid ID must be presented when claiming. The address must match the resident profile.', 'Payment is collected upon pickup at the Barangay Tubod office.'),
  ('Certificate of Indigency', 0, 'Valid ID must be presented when claiming. The address must match the resident profile.', 'Payment, if applicable, is collected upon pickup.'),
  ('Certificate of Residency', 50, 'Valid ID must be presented when claiming. The address must match the resident profile.', 'Payment is collected upon pickup at the Barangay Tubod office.'),
  ('Barangay Business Permit/Clearance', 200, 'Valid ID must be presented when claiming. The address must match the resident profile.', 'Bring any business information requested by the barangay. Payment is collected upon pickup.'),
  ('Cedula', 0, 'Valid ID must be presented when claiming. The address must match the resident profile.', 'The final community tax amount is assessed and collected at the barangay office.')
on conflict (name) do nothing;

update public.document_types
set is_active = false
where lower(trim(name)) in ('barangay id', 'business permit');

update public.document_types
set requirements = 'Valid ID must be presented when claiming. The address must match the resident profile.'
where lower(trim(name)) in (
  'barangay clearance',
  'certificate of indigency',
  'certificate of residency',
  'barangay business permit/clearance',
  'cedula'
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('request-attachments', 'request-attachments', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

alter table public.request_attachments enable row level security;
drop policy if exists "Residents manage their own request attachments" on public.request_attachments;
create policy "Residents manage their own request attachments"
on public.request_attachments for all to authenticated
using (resident_id = auth.uid() or public.is_admin())
with check (resident_id = auth.uid() or public.is_admin());

drop policy if exists "Admins view request attachment records" on public.request_attachments;
create policy "Admins view request attachment records"
on public.request_attachments for select to authenticated
using (public.is_admin());

drop policy if exists "Residents upload their own request attachments" on storage.objects;
create policy "Residents upload their own request attachments"
on storage.objects for insert to authenticated
with check (bucket_id = 'request-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Residents view their own request attachments" on storage.objects;
create policy "Residents view their own request attachments"
on storage.objects for select to authenticated
using (bucket_id = 'request-attachments' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin()));

drop policy if exists "Admins manage request attachments" on storage.objects;
create policy "Admins manage request attachments"
on storage.objects for all to authenticated
using (bucket_id = 'request-attachments' and public.is_admin())
with check (bucket_id = 'request-attachments' and public.is_admin());

-- Residents may update only their preferred meeting availability.
create or replace function public.protect_resident_incident_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if old.resident_id = auth.uid() then
    if (to_jsonb(new) - array['preferred_meeting_date', 'preferred_meeting_time', 'updated_at'])
       is distinct from
       (to_jsonb(old) - array['preferred_meeting_date', 'preferred_meeting_time', 'updated_at']) then
      raise exception 'Residents may only update preferred meeting availability';
    end if;
    if old.scheduled_meeting_date is not null then
      raise exception 'The official meeting schedule has already been issued';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_resident_incident_update_trigger on public.incident_reports;
create trigger protect_resident_incident_update_trigger
before update on public.incident_reports
for each row execute function public.protect_resident_incident_update();

-- Ticket status changes remain under barangay control. A resident reply automatically
-- moves a waiting ticket back to ongoing through this trusted trigger.
drop policy if exists "Residents update own helpdesk tickets" on public.concerns;

create or replace function public.handle_helpdesk_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare ticket public.concerns%rowtype;
begin
  select * into ticket from public.concerns where id = new.concern_id;
  update public.concerns
  set
    updated_at = now(),
    status = case
      when new.sender_role = 'resident' and status::text = 'waiting_for_resident'
        then 'ongoing'::public.case_status
      else status
    end
  where id = new.concern_id;

  if new.sender_role = 'admin' then
    insert into public.notifications(user_id, title, message, type, related_table, related_id, target_path)
    values (ticket.resident_id, 'New Barangay Help Desk reply', coalesce(ticket.ticket_number, 'Help Desk ticket'), 'concern', 'concerns', ticket.id, '/feedback?ticketId=' || ticket.id::text);
  end if;
  return new;
end;
$$;

drop trigger if exists helpdesk_message_activity on public.concern_messages;
create trigger helpdesk_message_activity after insert on public.concern_messages
for each row execute function public.handle_helpdesk_message();

-- Correct enum-to-text formatting for incident status notifications.
create or replace function public.notify_report_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare schedule_text text;
begin
  if new.status is distinct from old.status then
    insert into public.notifications(user_id, title, message, type, related_table, related_id, target_path)
    values (
      new.resident_id,
      'Report status: ' || replace(new.status::text, '_', ' '),
      coalesce(new.reference_number, 'Incident ticket'),
      'incident', 'incident_reports', new.id,
      '/report-summary?reportId=' || new.id::text
    );
  end if;

  if new.scheduled_meeting_date is not null
     and new.scheduled_meeting_time is not null
     and (new.scheduled_meeting_date is distinct from old.scheduled_meeting_date
       or new.scheduled_meeting_time is distinct from old.scheduled_meeting_time
       or new.respondent_id is distinct from old.respondent_id) then
    schedule_text := to_char(new.scheduled_meeting_date, 'Mon DD, YYYY') || ' at ' || to_char(new.scheduled_meeting_time, 'HH12:MI AM');
    insert into public.notifications(user_id, title, message, type, related_table, related_id, target_path)
    values (new.resident_id, 'Barangay meeting confirmed', coalesce(new.reference_number, 'Incident ticket'), 'meeting', 'incident_reports', new.id, '/report-summary?reportId=' || new.id::text);
    if new.respondent_id is not null then
      insert into public.notifications(user_id, title, message, type, related_table, related_id, target_path)
      values (new.respondent_id, 'Barangay appearance notice', 'You are requested to appear at ' || coalesce(new.meeting_venue, 'Barangay Tubod Hall') || ' on ' || schedule_text || '.', 'summons', 'incident_reports', new.id, '/notifications');
    end if;
  end if;
  return new;
end;
$$;

do $$
begin
  alter publication supabase_realtime add table public.announcements;
exception when duplicate_object then null;
end $$;
