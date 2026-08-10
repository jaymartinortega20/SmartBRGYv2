alter table public.document_requests
add column if not exists claim_method text not null default 'self'
  check (claim_method in ('self', 'representative')),
add column if not exists claimed_at timestamptz,
add column if not exists claimed_by uuid references auth.users(id) on delete set null,
add column if not exists claimed_by_role text
  check (claimed_by_role in ('resident', 'admin', 'system'));

-- Barangay ID is intentionally removed from resident request choices.
update public.document_types
set is_active = false
where lower(trim(name)) like '%barangay id%';

-- Use one clear claiming requirement for the four supported documents.
update public.document_types
set
  requirements = 'Valid ID must be presented when claiming. The address must match the resident profile.',
  instructions = 'Payment is collected upon pickup at the Barangay Tubod office.'
where
  lower(trim(name)) in (
    'barangay clearance',
    'certificate of indigency',
    'certificate of residency',
    'barangay business permit/clearance'
  )
  or lower(name) like '%business permit%'
  or lower(name) like '%business clearance%';

create or replace function public.set_document_claim_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'claimed' and old.status is distinct from 'claimed' then
    new.claimed_at := coalesce(new.claimed_at, now());
    new.claimed_by := coalesce(new.claimed_by, auth.uid());

    if public.is_admin() then
      new.claimed_by_role := 'admin';
    elsif auth.uid() = new.resident_id then
      new.claimed_by_role := 'resident';
    else
      new.claimed_by_role := coalesce(new.claimed_by_role, 'system');
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists set_document_claim_metadata_trigger
on public.document_requests;

create trigger set_document_claim_metadata_trigger
before update of status on public.document_requests
for each row
execute function public.set_document_claim_metadata();

create or replace function public.confirm_document_claim(request_id_input uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.document_requests%rowtype;
begin
  if auth.uid() is null then
    raise exception 'You must be logged in.';
  end if;

  select * into request_row
  from public.document_requests
  where id = request_id_input
  for update;

  if not found then
    raise exception 'Document request not found.';
  end if;

  if request_row.resident_id <> auth.uid() then
    raise exception 'You cannot confirm another resident request.';
  end if;

  if request_row.status = 'claimed' then
    return;
  end if;

  if request_row.status <> 'ready_to_claim' then
    raise exception 'This document is not ready to claim.';
  end if;

  update public.document_requests
  set
    status = 'claimed',
    claimed_at = now(),
    claimed_by = auth.uid(),
    claimed_by_role = 'resident',
    updated_at = now()
  where id = request_id_input;
end;
$$;

revoke all on function public.confirm_document_claim(uuid) from public;
grant execute on function public.confirm_document_claim(uuid) to authenticated;
