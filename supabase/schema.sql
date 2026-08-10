-- SmartBRGY V2 initial database schema
-- Run this once in the Supabase SQL Editor for a new project.

create extension if not exists pgcrypto;

do $$ begin
  create type public.user_role as enum ('resident', 'admin');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.request_status as enum
    ('pending', 'processing', 'ready_to_claim', 'claimed', 'rejected');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.case_status as enum
    ('pending', 'ongoing', 'resolved', 'rejected');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.appointment_status as enum
    ('pending', 'approved', 'rescheduled', 'completed', 'cancelled');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text not null default '',
  phone text,
  birthdate date,
  address text,
  purok text,
  role public.user_role not null default 'resident',
  profile_image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_types (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  fee numeric(10,2) not null default 0 check (fee >= 0),
  requirements text,
  instructions text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.document_requests (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.profiles(id) on delete cascade,
  document_type_id uuid not null references public.document_types(id),
  purpose text not null,
  copies integer not null default 1 check (copies between 1 and 20),
  fee_per_copy numeric(10,2) not null default 0 check (fee_per_copy >= 0),
  special_request text,
  status public.request_status not null default 'pending',
  admin_note text,
  claim_schedule timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.request_attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.document_requests(id) on delete cascade,
  resident_id uuid not null references public.profiles(id) on delete cascade,
  attachment_type text not null check
    (attachment_type in ('valid_id', 'authorization_letter')),
  storage_path text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  announcement_type text not null default 'General',
  message text not null,
  event_date date,
  event_time time,
  location text,
  contact_person text,
  image_path text,
  allow_attendance_confirmation boolean not null default false,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.event_attendees (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  resident_id uuid not null references public.profiles(id) on delete cascade,
  confirmed_at timestamptz not null default now(),
  primary key (announcement_id, resident_id)
);

create table if not exists public.incident_reports (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.profiles(id) on delete cascade,
  incident_type text not null,
  details text not null,
  location text not null,
  photo_path text,
  status public.case_status not null default 'pending',
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.concerns (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.profiles(id) on delete cascade,
  subject text not null,
  details text not null,
  special_request text,
  status public.case_status not null default 'pending',
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  resident_id uuid not null references public.profiles(id) on delete cascade,
  purpose text not null,
  persons_involved text,
  preferred_date date not null,
  preferred_time time not null,
  details text,
  status public.appointment_status not null default 'pending',
  approved_schedule timestamptz,
  admin_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, phone, address, purok)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'phone',
    new.raw_user_meta_data ->> 'address',
    new.raw_user_meta_data ->> 'purok'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

grant execute on function public.is_admin() to authenticated;

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and not public.is_admin() then
    raise exception 'Only an administrator can change account roles';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_role_before_update on public.profiles;
create trigger protect_profile_role_before_update
  before update on public.profiles
  for each row execute procedure public.protect_profile_role();

create or replace function public.apply_document_fee()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select fee into new.fee_per_copy
  from public.document_types
  where id = new.document_type_id and is_active = true;

  if new.fee_per_copy is null then
    raise exception 'The selected document is unavailable';
  end if;

  return new;
end;
$$;

drop trigger if exists apply_document_fee_before_write on public.document_requests;
create trigger apply_document_fee_before_write
  before insert or update of document_type_id on public.document_requests
  for each row execute procedure public.apply_document_fee();

alter table public.profiles enable row level security;
alter table public.document_types enable row level security;
alter table public.document_requests enable row level security;
alter table public.request_attachments enable row level security;
alter table public.announcements enable row level security;
alter table public.event_attendees enable row level security;
alter table public.incident_reports enable row level security;
alter table public.concerns enable row level security;
alter table public.appointments enable row level security;

create policy "Profiles are visible to owner or admin"
on public.profiles for select to authenticated
using (id = auth.uid() or public.is_admin());

create policy "Residents update their own profile"
on public.profiles for update to authenticated
using (id = auth.uid() or public.is_admin())
with check (id = auth.uid() or public.is_admin());

create policy "Authenticated users view active document types"
on public.document_types for select to authenticated
using (is_active or public.is_admin());

create policy "Admins manage document types"
on public.document_types for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "Residents create their own document requests"
on public.document_requests for insert to authenticated
with check (resident_id = auth.uid());

create policy "Residents view their own document requests"
on public.document_requests for select to authenticated
using (resident_id = auth.uid() or public.is_admin());

create policy "Admins update document requests"
on public.document_requests for update to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "Admins delete document requests"
on public.document_requests for delete to authenticated
using (public.is_admin());

create policy "Residents manage their own request attachments"
on public.request_attachments for all to authenticated
using (resident_id = auth.uid() or public.is_admin())
with check (resident_id = auth.uid() or public.is_admin());

create policy "Authenticated users view announcements"
on public.announcements for select to authenticated using (true);

create policy "Admins manage announcements"
on public.announcements for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "Residents manage their own attendance"
on public.event_attendees for all to authenticated
using (resident_id = auth.uid() or public.is_admin())
with check (resident_id = auth.uid() or public.is_admin());

create policy "Residents create their own incident reports"
on public.incident_reports for insert to authenticated
with check (resident_id = auth.uid());

create policy "Residents view their own incident reports"
on public.incident_reports for select to authenticated
using (resident_id = auth.uid() or public.is_admin());

create policy "Admins manage incident reports"
on public.incident_reports for update to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "Residents create their own concerns"
on public.concerns for insert to authenticated
with check (resident_id = auth.uid());

create policy "Residents view their own concerns"
on public.concerns for select to authenticated
using (resident_id = auth.uid() or public.is_admin());

create policy "Admins manage concerns"
on public.concerns for update to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy "Residents create their own appointments"
on public.appointments for insert to authenticated
with check (resident_id = auth.uid());

create policy "Residents view their own appointments"
on public.appointments for select to authenticated
using (resident_id = auth.uid() or public.is_admin());

create policy "Admins manage appointments"
on public.appointments for update to authenticated
using (public.is_admin()) with check (public.is_admin());

insert into public.document_types (name, fee, requirements, instructions)
values
  ('Barangay Clearance', 50, 'Valid ID', 'Bring the original ID when claiming.'),
  ('Barangay ID', 100, 'Valid ID and proof of residency', 'Personal appearance may be required.'),
  ('Certificate of Residency', 50, 'Valid ID', 'Address must match the resident profile.'),
  ('Business Permit', 200, 'Valid ID and business information', 'Barangay verification may be required.')
on conflict (name) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'request-attachments',
  'request-attachments',
  false,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "Residents upload their own request attachments"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'request-attachments'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Residents view their own request attachments"
on storage.objects for select to authenticated
using (
  bucket_id = 'request-attachments'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

create policy "Admins manage request attachments"
on storage.objects for all to authenticated
using (bucket_id = 'request-attachments' and public.is_admin())
with check (bucket_id = 'request-attachments' and public.is_admin());
