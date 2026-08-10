-- SmartBRGY incident meeting workflow and in-app notifications

-- Extend the existing status enum for the complete incident workflow.
alter type public.case_status add value if not exists 'under_review';
alter type public.case_status add value if not exists 'ongoing';
alter type public.case_status add value if not exists 'scheduled';
alter type public.case_status add value if not exists 'resolved';
alter type public.case_status add value if not exists 'rejected';

alter table public.incident_reports
  add column if not exists reference_number text,
  add column if not exists urgency text not null default 'medium',
  add column if not exists incident_date date,
  add column if not exists incident_time time,
  add column if not exists area text,
  add column if not exists landmark text,
  add column if not exists persons_involved text,
  add column if not exists request_meeting boolean not null default false,
  add column if not exists respondent_name text,
  add column if not exists respondent_address text,
  add column if not exists respondent_id uuid references public.profiles(id) on delete set null,
  add column if not exists meeting_reason text,
  add column if not exists preferred_meeting_date date,
  add column if not exists preferred_meeting_time time,
  add column if not exists scheduled_meeting_date date,
  add column if not exists scheduled_meeting_time time,
  add column if not exists meeting_venue text,
  add column if not exists assigned_official text,
  add column if not exists admin_note text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.incident_reports drop constraint if exists incident_reports_urgency_check;
alter table public.incident_reports add constraint incident_reports_urgency_check check (urgency in ('low', 'medium', 'high'));
create unique index if not exists incident_reports_reference_number_key on public.incident_reports(reference_number) where reference_number is not null;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  message text not null,
  type text not null default 'general',
  related_table text,
  related_id uuid,
  target_path text,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_user_unread_idx on public.notifications(user_id, is_read) where is_read = false;

alter table public.notifications enable row level security;
drop policy if exists "Residents view own notifications" on public.notifications;
create policy "Residents view own notifications" on public.notifications for select to authenticated using (user_id = auth.uid());
drop policy if exists "Residents mark own notifications read" on public.notifications;
create policy "Residents mark own notifications read" on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
drop policy if exists "Admins manage notifications" on public.notifications;
create policy "Admins manage notifications" on public.notifications for all to authenticated using (public.is_admin()) with check (public.is_admin());

create or replace function public.notify_report_submitted()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications(user_id, title, message, type, related_table, related_id, target_path)
  values (new.resident_id, 'Incident report submitted', coalesce(new.reference_number, 'Incident ticket'), 'incident', 'incident_reports', new.id, '/report-summary?reportId=' || new.id::text);
  return new;
end;
$$;

drop trigger if exists incident_report_submitted_notification on public.incident_reports;
create trigger incident_report_submitted_notification after insert on public.incident_reports for each row execute function public.notify_report_submitted();

create or replace function public.notify_report_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  schedule_text text;
begin
  if new.status is distinct from old.status then
    insert into public.notifications(user_id, title, message, type, related_table, related_id, target_path)
    values (new.resident_id, 'Report status: ' || replace(new.status::text, '_', ' '), coalesce(new.reference_number, 'Incident ticket'), 'incident', 'incident_reports', new.id, '/report-summary?reportId=' || new.id::text);
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
      values (new.respondent_id, 'Barangay appearance notice', 'You are requested to appear at ' || coalesce(new.meeting_venue, 'Barangay Tubod Hall') || ' on ' || schedule_text || '. Open this notice for the official schedule.', 'summons', 'incident_reports', new.id, '/notifications');
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists incident_report_update_notification on public.incident_reports;
create trigger incident_report_update_notification after update on public.incident_reports for each row execute function public.notify_report_update();

create or replace function public.notify_document_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare doc_name text;
begin
  if new.status is distinct from old.status and new.status in ('ready_to_claim', 'claimed', 'rejected') then
    select name into doc_name from public.document_types where id = new.document_type_id;
    insert into public.notifications(user_id, title, message, type, related_table, related_id, target_path)
    values (
      new.resident_id,
      case when new.status = 'ready_to_claim' then 'Document ready to claim' when new.status = 'claimed' then 'Document claimed' else 'Document request update' end,
      coalesce(doc_name, 'Your requested document') || case when new.status = 'ready_to_claim' then ' is ready for pickup. Please bring the required valid ID.' when new.status = 'claimed' then ' has been marked as claimed.' else ' request was not approved. Open the request for details.' end,
      'document', 'document_requests', new.id, '/documents'
    );
  end if;
  return new;
end;
$$;

drop trigger if exists document_request_update_notification on public.document_requests;
create trigger document_request_update_notification after update on public.document_requests for each row execute function public.notify_document_update();

create or replace function public.notify_new_announcement()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications(user_id, title, message, type, related_table, related_id, target_path)
  select id, 'New barangay announcement', new.title, 'announcement', 'announcements', new.id, '/announcement'
  from public.profiles where role = 'resident';
  return new;
end;
$$;

drop trigger if exists announcement_created_notification on public.announcements;
create trigger announcement_created_notification after insert on public.announcements for each row execute function public.notify_new_announcement();

-- Realtime changes for the notification center and tab badge.
do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when duplicate_object then null;
end $$;

-- Resident access for report summaries and preferred-schedule updates.
alter table public.incident_reports enable row level security;
drop policy if exists "Residents view own incident reports" on public.incident_reports;
create policy "Residents view own incident reports" on public.incident_reports for select to authenticated using (resident_id = auth.uid() or public.is_admin());
drop policy if exists "Residents update own incident reports" on public.incident_reports;
create policy "Residents update own incident reports" on public.incident_reports for update to authenticated using (resident_id = auth.uid() or public.is_admin()) with check (resident_id = auth.uid() or public.is_admin());

-- Private incident evidence: residents see their own files; admins can review evidence.
drop policy if exists "Residents upload own incident evidence" on storage.objects;
create policy "Residents upload own incident evidence" on storage.objects for insert to authenticated with check (bucket_id = 'incident-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Residents view own incident evidence" on storage.objects;
create policy "Residents view own incident evidence" on storage.objects for select to authenticated using (bucket_id = 'incident-photos' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "Admins view incident evidence" on storage.objects;
create policy "Admins view incident evidence" on storage.objects for select to authenticated using (bucket_id = 'incident-photos' and public.is_admin());

-- Upgrade existing reporter notifications to the new ticket-summary route.
update public.notifications as notification
set
  message = coalesce(report.reference_number, 'Incident ticket'),
  target_path = '/report-summary?reportId=' || report.id::text
from public.incident_reports as report
where notification.related_table = 'incident_reports'
  and notification.related_id = report.id
  and notification.user_id = report.resident_id;
