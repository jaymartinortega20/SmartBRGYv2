-- SmartBRGY migration 010: let administrators delete Help Desk conversations
-- from the admin website ("Delete" button). Safe to run more than once.

drop policy if exists "Admins delete helpdesk tickets" on public.concerns;
create policy "Admins delete helpdesk tickets"
on public.concerns for delete to authenticated
using (public.is_admin());

drop policy if exists "Admins delete helpdesk messages" on public.concern_messages;
create policy "Admins delete helpdesk messages"
on public.concern_messages for delete to authenticated
using (public.is_admin());

-- Live updates on the admin website for new residents, requests and reports.
do $$ begin
  alter publication supabase_realtime add table public.profiles;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.document_requests;
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
