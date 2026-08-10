-- Run this migration after schema.sql.
-- It adds private media buckets for incident evidence and resident profile images.

-- Allow trusted SQL Editor operations to create the first admin while still
-- preventing authenticated residents from changing their own role.
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

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('incident-photos', 'incident-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']),
  ('profile-images', 'profile-images', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "Residents upload their own incident photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'incident-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Residents or admins view incident photos"
on storage.objects for select to authenticated
using (
  bucket_id = 'incident-photos'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);

create policy "Admins manage incident photos"
on storage.objects for all to authenticated
using (bucket_id = 'incident-photos' and public.is_admin())
with check (bucket_id = 'incident-photos' and public.is_admin());

create policy "Residents upload their own profile images"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Residents update their own profile images"
on storage.objects for update to authenticated
using (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'profile-images'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Residents or admins view profile images"
on storage.objects for select to authenticated
using (
  bucket_id = 'profile-images'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or public.is_admin()
  )
);
