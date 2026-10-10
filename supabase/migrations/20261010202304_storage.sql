-- Storage buckets: `pictures` (public, read via public URL; written by service
-- role only) and `avatars` (private; users write only under <uid>/).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('pictures', 'pictures', true, null, null),
  ('avatars', 'avatars', false, 2097152, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Any signed-in user may read avatars (needed to sign URLs for other players).
create policy "avatars_read_authenticated" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars');

create policy "avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- pictures: no insert/update/delete policies => only service_role (bypasses RLS) can write.
create policy "pictures_read_all" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'pictures');
