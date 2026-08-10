alter table public.profiles
  add column if not exists id_front_path text,
  add column if not exists id_back_path text,
  add column if not exists is_banned boolean not null default false,
  add column if not exists ban_reason text,
  add column if not exists banned_at timestamptz;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resident-valid-ids', 'resident-valid-ids', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "Admins view resident valid IDs" on storage.objects;
create policy "Admins view resident valid IDs"
on storage.objects for select to authenticated
using (bucket_id = 'resident-valid-ids' and public.is_admin());

drop policy if exists "Admins manage resident valid IDs" on storage.objects;
create policy "Admins manage resident valid IDs"
on storage.objects for all to authenticated
using (bucket_id = 'resident-valid-ids' and public.is_admin())
with check (bucket_id = 'resident-valid-ids' and public.is_admin());
