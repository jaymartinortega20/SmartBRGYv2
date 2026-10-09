-- SmartBRGY migration 011: cleaner notifications and automatic push delivery.
-- Safe to run more than once. Does not delete residents' data.
--
--  * No more double notifications (admin's first Help Desk reply; meeting
--    scheduling).
--  * Rejection reasons written by the admin are included in the resident's
--    notification.
--  * A resident reply on a "Resolved" Help Desk conversation reopens it.
--  * Push notifications are sent automatically for every new notification
--    (replaces the manual Database Webhook). Needs the one-time secret step
--    at the bottom of this file.

------------------------------------------------------------------------------
-- 1. Help Desk: automatic status changes are "silent" (no extra notification).
------------------------------------------------------------------------------
create or replace function public.notify_concern_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status
     and coalesce(current_setting('smartbrgy.silent_status', true), '') <> 'on' then
    insert into public.notifications(user_id, title, message, type, related_table, related_id, target_path)
    values (
      new.resident_id,
      'Help Desk status: ' || replace(new.status::text, '_', ' '),
      coalesce(new.ticket_number, 'Help Desk ticket'),
      'concern', 'concerns', new.id,
      '/feedback?ticketId=' || new.id::text
    );
  end if;
  return new;
end;
$$;

create or replace function public.handle_helpdesk_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare ticket public.concerns%rowtype;
begin
  select * into ticket from public.concerns where id = new.concern_id;

  -- These status moves are explained by the message itself, so they do not
  -- send a separate "status changed" notification.
  perform set_config('smartbrgy.silent_status', 'on', true);
  update public.concerns
  set
    updated_at = now(),
    status = case
      when new.sender_role = 'admin' and status::text in ('open', 'pending')
        then 'under_review'::public.case_status
      when new.sender_role = 'resident' and status::text in ('waiting_for_resident', 'resolved')
        then 'ongoing'::public.case_status
      else status
    end
  where id = new.concern_id;
  perform set_config('smartbrgy.silent_status', 'off', true);

  if new.sender_role = 'admin' then
    insert into public.notifications(user_id, title, message, type, related_table, related_id, target_path)
    values (
      ticket.resident_id,
      'New Barangay Help Desk reply',
      coalesce(ticket.ticket_number, 'Help Desk ticket') || ': ' || left(new.message, 120),
      'concern', 'concerns', ticket.id,
      '/feedback?ticketId=' || ticket.id::text
    );
  end if;
  return new;
end;
$$;

------------------------------------------------------------------------------
-- 2. Incident reports: one notification per change, with the admin's note.
------------------------------------------------------------------------------
create or replace function public.notify_report_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  schedule_text text;
  schedule_changed boolean;
begin
  schedule_changed := new.scheduled_meeting_date is not null
    and new.scheduled_meeting_time is not null
    and (new.scheduled_meeting_date is distinct from old.scheduled_meeting_date
      or new.scheduled_meeting_time is distinct from old.scheduled_meeting_time
      or new.respondent_id is distinct from old.respondent_id);

  -- Skip the plain status message when the meeting notice below says it all.
  if new.status is distinct from old.status
     and not (schedule_changed and new.status::text = 'scheduled') then
    insert into public.notifications(user_id, title, message, type, related_table, related_id, target_path)
    values (
      new.resident_id,
      'Report status: ' || replace(new.status::text, '_', ' '),
      coalesce(new.reference_number, 'Incident ticket')
        || case when nullif(trim(coalesce(new.admin_note, '')), '') is not null
                 and new.admin_note is distinct from old.admin_note
                then ' — ' || left(new.admin_note, 200) else '' end,
      'incident', 'incident_reports', new.id,
      '/report-summary?reportId=' || new.id::text
    );
  end if;

  if schedule_changed then
    schedule_text := to_char(new.scheduled_meeting_date, 'Mon DD, YYYY') || ' at ' || to_char(new.scheduled_meeting_time, 'HH12:MI AM');
    insert into public.notifications(user_id, title, message, type, related_table, related_id, target_path)
    values (
      new.resident_id,
      'Barangay meeting confirmed',
      coalesce(new.reference_number, 'Incident ticket') || ': ' || schedule_text || ', ' || coalesce(new.meeting_venue, 'Barangay Tubod Hall') || '.',
      'meeting', 'incident_reports', new.id,
      '/report-summary?reportId=' || new.id::text
    );
    if new.respondent_id is not null then
      insert into public.notifications(user_id, title, message, type, related_table, related_id, target_path)
      values (
        new.respondent_id,
        'Barangay appearance notice',
        'You are requested to appear at ' || coalesce(new.meeting_venue, 'Barangay Tubod Hall') || ' on ' || schedule_text || '.',
        'summons', 'incident_reports', new.id,
        '/notifications'
      );
    end if;
  end if;
  return new;
end;
$$;

------------------------------------------------------------------------------
-- 3. Document requests: the rejection reason is part of the notification.
------------------------------------------------------------------------------
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
      case when new.status = 'ready_to_claim' then 'Document ready to claim'
           when new.status = 'claimed' then 'Document claimed'
           else 'Document request not approved' end,
      coalesce(doc_name, 'Your requested document') ||
      case when new.status = 'ready_to_claim' then ' is ready for pickup. Please bring the required valid ID.'
           when new.status = 'claimed' then ' has been marked as claimed.'
           else ' request was not approved.'
             || coalesce(' Reason: ' || nullif(trim(new.admin_note), ''), ' Visit the barangay office for details.')
      end,
      'document', 'document_requests', new.id, '/documents'
    );
  end if;
  return new;
end;
$$;

------------------------------------------------------------------------------
-- 4. Automatic push delivery for every new notification.
--    Replaces a manual "Database Webhook" to send-push (removed below so
--    residents never get the same push twice).
------------------------------------------------------------------------------
create extension if not exists pg_net;

do $$
declare trigger_row record;
begin
  for trigger_row in
    select t.tgname
    from pg_trigger t
    where t.tgrelid = 'public.notifications'::regclass
      and not t.tgisinternal
      and encode(t.tgargs, 'escape') like '%send-push%'
  loop
    execute format('drop trigger if exists %I on public.notifications', trigger_row.tgname);
  end loop;
end $$;

create or replace function public.send_push_for_notification()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  webhook_secret text;
begin
  begin
    select decrypted_secret into webhook_secret
    from vault.decrypted_secrets
    where name = 'push_webhook_secret'
    limit 1;
  exception when others then
    webhook_secret := null;
  end;

  -- Without the secret, the in-app notification is still saved; only the
  -- phone push is skipped.
  if webhook_secret is null then
    return new;
  end if;

  begin
    perform net.http_post(
      url := 'https://krseqglaqtndiyyihpgs.supabase.co/functions/v1/send-push',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-smartbrgy-webhook-secret', webhook_secret
      ),
      body := jsonb_build_object('record', to_jsonb(new))
    );
  exception when others then
    -- A push problem must never stop the notification from being saved.
    raise warning 'SmartBRGY push not queued: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists send_push_after_notification on public.notifications;
create trigger send_push_after_notification
after insert on public.notifications
for each row execute function public.send_push_for_notification();

------------------------------------------------------------------------------
-- ONE-TIME SECRET STEP (run separately, do not save the secret in GitHub):
--
--   1. Pick a long random password, e.g. SmartBRGY-push-8f3k2m9q7x1z
--   2. In the VS Code terminal:
--        npx supabase secrets set PUSH_WEBHOOK_SECRET=SmartBRGY-push-8f3k2m9q7x1z
--   3. In the Supabase SQL Editor (same value):
--        select vault.create_secret('SmartBRGY-push-8f3k2m9q7x1z', 'push_webhook_secret');
--      (If it says the name already exists, use:
--        select vault.update_secret(
--          (select id from vault.secrets where name = 'push_webhook_secret'),
--          'SmartBRGY-push-8f3k2m9q7x1z');)
------------------------------------------------------------------------------
